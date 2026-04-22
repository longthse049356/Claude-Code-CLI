import {
  createMessage,
  getMessagesByChannel,
  getMessagesAfter,
  updateAgentCursor,
} from "../server/database.ts";
import { sendMessage } from "../providers/anthropic.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import { log } from "../server/logger.ts";
import { getToolSchemas, executeTool } from "../tools/registry.ts";
import { setProgress, clearProgress, appendToken, clearTokens } from "./progress.ts";
import type { Agent, Message, ToolResultBlock } from "../types.ts";

/**
 * Check if this agent is mentioned in the user messages, or if no @mentions exist.
 *
 * Rules:
 * - If no message contains "@", all agents respond (backward compat).
 * - If any message contains "@", only the agent whose @mention appears responds.
 *
 * Mention format: @AgentName (spaces stripped, case-insensitive).
 * Example: "Jarvis 2" → @Jarvis2
 */
function shouldRespond(agentName: string, userMessages: { text: string }[]): boolean {
  const normalizedAgentMention = `@${agentName.replace(/\s+/g, "").toLowerCase()}`;
  const anyMention = userMessages.some((m) => m.text.includes("@"));
  if (!anyMention) return true; // No @mentions → all agents respond
  return userMessages.some((m) =>
    m.text.toLowerCase().includes(normalizedAgentMention)
  );
}

export class WorkerLoop {
  private running = false;
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = { ...agent };
  }

  start(): void {
    this.running = true;
    log(`[WORKER] ${this.agent.name} starting in channel "${this.agent.channel_id}"`);
    this.tick();
  }

  stop(): void {
    this.running = false;
    log(`[WORKER] ${this.agent.name} stopped`);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      // 1. Find new messages since last cursor
      const newMessages = getMessagesAfter(this.agent.channel_id, this.agent.last_processed_at);
      const userMessages = newMessages.filter((m) => m.role === "user");

      if (userMessages.length === 0 && newMessages.length > 0) {
        // Only assistant replies exist — advance cursor so we don't re-scan them
        const cursor = Math.max(...newMessages.map((m) => m.created_at));
        updateAgentCursor(this.agent.id, cursor);
        this.agent.last_processed_at = cursor;
      }

      if (userMessages.length > 0) {
        // 2. Advance cursor BEFORE LLM call (at-most-once delivery)
        const cursor = Date.now();
        updateAgentCursor(this.agent.id, cursor);
        this.agent.last_processed_at = cursor;

        // 3. Check @mention routing — skip if addressed to another agent
        if (!shouldRespond(this.agent.name, userMessages)) {
          log(`[WORKER] ${this.agent.name} — not mentioned, skipping`);
        } else {
          log(`[WORKER] ${this.agent.name} — ${userMessages.length} new user message(s), processing`);

          // 4. Load full conversation history for context
          const history = getMessagesByChannel(this.agent.channel_id);

          // 5. Map DbMessage[] → Message[] for the LLM
          const messages: Message[] = history.map((m): Message => {
            if (m.role === "user") {
              return { role: "user", content: m.text };
            }
            return { role: "assistant", content: [{ type: "text", text: m.text }] };
          });

          // 6. Call LLM with tools
          const tools = getToolSchemas();
          const systemPrompt = buildSystemPrompt(this.agent.name, this.agent.system_prompt);
          setProgress(this.agent.channel_id, { type: "thinking" });
          clearTokens(this.agent.channel_id);
          let result = await sendMessage(messages, {
            model: this.agent.model,
            systemPrompt,
            tools,
            onToken: (delta) => appendToken(this.agent.channel_id, delta),
          });

          // 7. Tool execution loop
          const MAX_TOOL_ITERATIONS = 10;
          let iterations = 0;

          while (result.stopReason === "tool_use" && iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            log(`[WORKER] ${this.agent.name} — tool iteration ${iterations}`);

            messages.push({ role: "assistant", content: result.content });

            const toolResults: ToolResultBlock[] = [];
            for (const block of result.content) {
              if (block.type === "tool_use") {
                log(`[WORKER] ${this.agent.name} — executing tool "${block.name}"`);
                setProgress(this.agent.channel_id, { type: "tool_call", toolName: block.name, iteration: iterations });
                const { result: toolResult, isError } = await executeTool(block.name, block.input);
                setProgress(this.agent.channel_id, { type: "tool_done", toolName: block.name });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: toolResult,
                  ...(isError ? { is_error: true } : {}),
                });
              }
            }

            messages.push({ role: "user", content: toolResults });
            setProgress(this.agent.channel_id, { type: "thinking" });
            clearTokens(this.agent.channel_id);
            result = await sendMessage(messages, {
              model: this.agent.model,
              systemPrompt,
              tools,
              onToken: (delta) => appendToken(this.agent.channel_id, delta),
            });
          }

          if (iterations >= MAX_TOOL_ITERATIONS) {
            log(`[WORKER] ${this.agent.name} — hit max tool iterations (${MAX_TOOL_ITERATIONS})`);
          }

          // 8. Extract text from final response
          const replyText = result.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { type: "text"; text: string }).text)
            .join("");

          if (!replyText.trim()) {
            log(`[WORKER] ${this.agent.name} — LLM returned empty text, skipping reply`);
          } else {
            // 9. Save reply to DB
            const reply = {
              id: crypto.randomUUID(),
              channel_id: this.agent.channel_id,
              text: replyText,
              role: "assistant" as const,
              agent_name: this.agent.name,
              created_at: Date.now(),
            };
            createMessage(reply);
            log(`[WORKER] ${this.agent.name} — replied: "${replyText.slice(0, 60)}..."`);
          }
          clearProgress(this.agent.channel_id);
          clearTokens(this.agent.channel_id);
        }
      }
    } catch (err) {
      log(`[WORKER] ${this.agent.name} error:`, err);
    }

    if (this.running) {
      setTimeout(() => this.tick(), 1000);
    }
  }
}
