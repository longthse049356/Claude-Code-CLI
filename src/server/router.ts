import type {
  Agent,
  ApiError,
  Channel,
  CreateAgentBody,
  CreateChannelBody,
  CreateMessageBody,
  DbMessage,
  Message,
  SseChatEvent,
} from "../types.ts";
import {
  createAgent,
  createChannel,
  createMessage,
  deleteAgent,
  getAgentByChannelAndName,
  getAgentsByChannel,
  getAllChannels,
  getChannel,
  getMessagesByChannel,
} from "./database.ts";
import { broadcast } from "./websocket.ts";
import { startAgent, stopAgent } from "../agent/worker-manager.ts";
import { buildSystemPrompt } from "../agent/system-prompt.ts";
import { DEFAULT_MODEL, streamTextDeltas } from "../providers/anthropic.ts";
import { log } from "./logger.ts";

function json(data: unknown, status = 200): Response {
  log(`[ROUTER] → response ${status}: ${JSON.stringify(data)}`);
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);

  // POST /channels — create a new channel
  if (req.method === "POST" && parts.length === 1 && parts[0] === "channels") {
    log(`[ROUTER] matched: POST /channels`);

    let body: CreateChannelBody;
    try {
      body = (await req.json()) as CreateChannelBody;
      log(`[ROUTER] body: ${JSON.stringify(body)}`);
    } catch {
      log(`[ROUTER] body parse FAILED — invalid JSON`);
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.name || body.name.trim() === "") {
      log(`[ROUTER] validation FAILED — name is required`);
      return json({ error: "name is required" } satisfies ApiError, 400);
    }

    const id = crypto.randomUUID();
    const created_at = Date.now();
    createChannel(id, body.name.trim(), created_at);

    return json({ id, name: body.name.trim(), created_at } satisfies Channel, 201);
  }

  // GET /channels — list all channels
  if (req.method === "GET" && parts.length === 1 && parts[0] === "channels") {
    log(`[ROUTER] matched: GET /channels`);
    const channels = getAllChannels();
    log(`[ROUTER] returning ${channels.length} channel(s)`);
    return json({ channels });
  }

  // GET /channels/:id/messages — list messages in a channel
  if (
    req.method === "GET" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "messages"
  ) {
    const channelId = parts[1];
    log(`[ROUTER] matched: GET /channels/:id/messages — channelId="${channelId}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const messages = getMessagesByChannel(channelId);
    log(`[ROUTER] returning ${messages.length} message(s)`);
    return json(messages);
  }

  // GET /channels/:id/agents — list agents in a channel
  if (
    req.method === "GET" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "agents"
  ) {
    const channelId = parts[1];
    log(`[ROUTER] matched: GET /channels/:id/agents — channelId="${channelId}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const agents = getAgentsByChannel(channelId);
    log(`[ROUTER] returning ${agents.length} agent(s)`);
    return json({ agents });
  }

  // POST /channels/:id/messages/stream — send message and stream assistant response via SSE
  if (
    req.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "channels" &&
    parts[2] === "messages" &&
    parts[3] === "stream"
  ) {
    const channelId = parts[1];
    log(`[ROUTER] matched: POST /channels/:id/messages/stream — channelId="${channelId}"`);

    let body: CreateMessageBody;
    try {
      body = (await req.json()) as CreateMessageBody;
      log(`[ROUTER] body: ${JSON.stringify(body)}`);
    } catch {
      log(`[ROUTER] body parse FAILED — invalid JSON`);
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.text || body.text.trim() === "") {
      log(`[ROUTER] validation FAILED — text is required`);
      return json({ error: "text is required" } satisfies ApiError, 400);
    }

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const agents = getAgentsByChannel(channelId);
    if (agents.length === 0) {
      log(`[ROUTER] no agents in channel "${channelId}"`);
      return json({ error: "no agents in channel" } satisfies ApiError, 400);
    }

    const agent = agents[0];
    const now = Date.now();
    const userMsg: DbMessage = {
      id: crypto.randomUUID(),
      channel_id: channelId,
      text: body.text.trim(),
      role: "user",
      created_at: now,
    };

    createMessage(userMsg);
    log(`[ROUTER] broadcasting user message to WS clients...`);
    broadcast({ type: "new_message", data: userMsg });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: SseChatEvent) => {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          );
        };

        try {
          send({ type: "user_message_saved", data: userMsg });

          const history = getMessagesByChannel(channelId).map((m): Message =>
            m.role === "user"
              ? { role: "user", content: m.text }
              : { role: "assistant", content: [{ type: "text", text: m.text }] }
          );

          const assistantId = crypto.randomUUID();
          const assistantCreatedAt = Date.now();

          send({
            type: "assistant_start",
            data: {
              id: assistantId,
              channel_id: channelId,
              agent_name: agent.name,
              created_at: assistantCreatedAt,
            },
          });

          const anthropic = await import("@anthropic-ai/sdk");
          const client = new anthropic.default({
            apiKey: process.env.ANTHROPIC_API_KEY,
            ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
          });

          const apiMessages = history.map((msg) => {
            if (msg.role === "user") {
              return { role: "user" as const, content: msg.content };
            }
            return {
              role: "assistant" as const,
              content: msg.content.map((block) => {
                if (block.type === "text") {
                  return { type: "text" as const, text: block.text };
                }
                return {
                  type: "tool_use" as const,
                  id: block.id,
                  name: block.name,
                  input: block.input,
                };
              }),
            };
          });

          const llmStream = client.messages.stream({
            model: agent.model || DEFAULT_MODEL,
            max_tokens: 4096,
            system: buildSystemPrompt(agent.name, agent.system_prompt),
            messages: apiMessages,
          });

          let fullText = "";
          await streamTextDeltas(llmStream as AsyncIterable<unknown>, async (chunk) => {
            fullText += chunk;
            send({ type: "assistant_delta", data: { chunk } });
          });

          const assistantMsg: DbMessage = {
            id: assistantId,
            channel_id: channelId,
            text: fullText,
            role: "assistant",
            created_at: assistantCreatedAt,
          };

          createMessage(assistantMsg);
          log(`[ROUTER] broadcasting assistant message to WS clients...`);
          broadcast({ type: "new_message", data: assistantMsg });
          send({ type: "assistant_done", data: assistantMsg });
        } catch (error) {
          send({ type: "error", data: { message: String(error) } });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // POST /channels/:id/messages — send a message to a channel
  if (
    req.method === "POST" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "messages"
  ) {
    const channelId = parts[1];
    log(`[ROUTER] matched: POST /channels/:id/messages — channelId="${channelId}"`);

    let body: CreateMessageBody;
    try {
      body = (await req.json()) as CreateMessageBody;
      log(`[ROUTER] body: ${JSON.stringify(body)}`);
    } catch {
      log(`[ROUTER] body parse FAILED — invalid JSON`);
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.text || body.text.trim() === "") {
      log(`[ROUTER] validation FAILED — text is required`);
      return json({ error: "text is required" } satisfies ApiError, 400);
    }

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const msg: DbMessage = {
      id: crypto.randomUUID(),
      channel_id: channelId,
      text: body.text.trim(),
      role: "user",
      created_at: Date.now(),
    };

    createMessage(msg);
    log(`[ROUTER] broadcasting to WS clients...`);
    broadcast({ type: "new_message", data: msg });

    return json(msg, 201);
  }

  // POST /channels/:id/agents — create a new agent in a channel
  if (
    req.method === "POST" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "agents"
  ) {
    const channelId = parts[1];
    log(`[ROUTER] matched: POST /channels/:id/agents — channelId="${channelId}"`);

    let body: CreateAgentBody;
    try {
      body = (await req.json()) as CreateAgentBody;
      log(`[ROUTER] body: ${JSON.stringify(body)}`);
    } catch {
      log(`[ROUTER] body parse FAILED — invalid JSON`);
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.name || body.name.trim() === "") {
      log(`[ROUTER] validation FAILED — name is required`);
      return json({ error: "name is required" } satisfies ApiError, 400);
    }

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const existing = getAgentByChannelAndName(channelId, body.name.trim());
    if (existing) {
      log(`[ROUTER] agent "${body.name.trim()}" already exists in channel "${channelId}"`);
      return json({ error: "agent already exists" } satisfies ApiError, 409);
    }

    const agent: Agent = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      channel_id: channelId,
      model: body.model ?? DEFAULT_MODEL,
      system_prompt: body.system_prompt ?? "",
      last_processed_at: 0,
      created_at: Date.now(),
    };

    createAgent(agent);
    startAgent(agent);
    log(`[ROUTER] agent "${agent.name}" created and started`);

    return json(agent, 201);
  }

  // DELETE /channels/:id/agents/:name — remove an agent from a channel
  if (
    req.method === "DELETE" &&
    parts.length === 4 &&
    parts[0] === "channels" &&
    parts[2] === "agents"
  ) {
    const channelId = parts[1];
    const agentName = parts[3];
    log(`[ROUTER] matched: DELETE /channels/:id/agents/:name — channelId="${channelId}" name="${agentName}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const agent = getAgentByChannelAndName(channelId, agentName);
    if (!agent) {
      log(`[ROUTER] agent "${agentName}" NOT FOUND in channel "${channelId}"`);
      return json({ error: "agent not found" } satisfies ApiError, 404);
    }

    stopAgent(agent.id);
    deleteAgent(agent.id);
    log(`[ROUTER] agent "${agentName}" stopped and deleted`);

    return json({ message: "agent stopped" }, 200);
  }

  // Serve static files from packages/ui/dist/
  log(`[ROUTER] attempting to serve static file: ${url.pathname}`);
  const baseDir = import.meta.dir;
  const uiDistDir = `${baseDir}/../packages/ui/dist`;
  const filePath = `${uiDistDir}${url.pathname.split("?")[0]}`;

  const file = Bun.file(filePath);
  if (await file.exists()) {
    log(`[ROUTER] serving static file: ${filePath}`);
    return new Response(file);
  }

  // If no file found, try index.html for SPA routing
  const indexFile = Bun.file(`${uiDistDir}/index.html`);
  if (await indexFile.exists()) {
    log(`[ROUTER] serving index.html for SPA routing`);
    return new Response(indexFile, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // No route or file matched
  log(`[ROUTER] no route matched for ${req.method} ${url.pathname}`);
  return json({ error: "not found" } satisfies ApiError, 404);
}
