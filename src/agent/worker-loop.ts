import {
  createMessage,
  getMessagesByChannel,
  getMessagesAfter,
  updateAgentCursor,
} from "../server/database.ts";
import { broadcast } from "../server/websocket.ts";
import { sendMessage } from "../providers/anthropic.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import type { Agent, Message } from "../types.ts";

export class WorkerLoop {
  private running = false;
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = { ...agent }; // copy so we can mutate last_processed_at in memory
  }

  start(): void {
    this.running = true;
    console.log(`[WORKER] ${this.agent.name} starting in channel "${this.agent.channel_id}"`);
    this.tick();
  }

  stop(): void {
    this.running = false;
    console.log(`[WORKER] ${this.agent.name} stopped`);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      // 1. Find new user messages since last cursor
      const newMessages = getMessagesAfter(this.agent.channel_id, this.agent.last_processed_at);
      const userMessages = newMessages.filter((m) => m.role === "user");

      if (userMessages.length > 0) {
        console.log(`[WORKER] ${this.agent.name} — ${userMessages.length} new user message(s), processing`);

        // 2. Broadcast typing indicator
        broadcast({ type: "typing", data: { agent_name: this.agent.name, channel_id: this.agent.channel_id } });

        // 3. Advance cursor BEFORE LLM call (at-most-once: if LLM crashes, messages are not reprocessed)
        const cursor = Date.now();
        updateAgentCursor(this.agent.id, cursor);
        this.agent.last_processed_at = cursor; // keep in-memory in sync

        // 4. Load full conversation history for context
        const history = getMessagesByChannel(this.agent.channel_id);

        // 5. Map DbMessage[] → Message[] for the LLM
        const messages: Message[] = history.map((m): Message => {
          if (m.role === "user") {
            return { role: "user", content: m.text };
          }
          return { role: "assistant", content: [{ type: "text", text: m.text }] };
        });

        // 6. Call LLM (no tools in M3)
        const systemPrompt = buildSystemPrompt(this.agent.name, this.agent.system_prompt);
        const result = await sendMessage(messages, { model: this.agent.model, systemPrompt });

        // 7. Extract text from response
        const replyText = result.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("");

        if (!replyText.trim()) {
          console.log(`[WORKER] ${this.agent.name} — LLM returned empty text, skipping reply`);
        } else {
          // 8. Save reply to DB and broadcast
          const reply = {
            id: crypto.randomUUID(),
            channel_id: this.agent.channel_id,
            text: replyText,
            role: "assistant" as const,
            created_at: Date.now(),
          };
          createMessage(reply);
          broadcast({ type: "new_message", data: reply });
          console.log(`[WORKER] ${this.agent.name} — replied: "${replyText.slice(0, 60)}..."`);
        }
      }
    } catch (err) {
      console.error(`[WORKER] ${this.agent.name} error:`, err);
      // Loop continues — error does not stop the worker
    }

    // 9. Schedule next tick AFTER current finishes (recursive setTimeout, never overlaps)
    if (this.running) {
      setTimeout(() => this.tick(), 200);
    }
  }
}
