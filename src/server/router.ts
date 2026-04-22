import type {
  Agent,
  ApiError,
  Channel,
  CreateAgentBody,
  CreateChannelBody,
  CreateMessageBody,
  DbMessage,
} from "../types.ts";
import {
  createAgent,
  createChannel,
  createMessage,
  deleteAgent,
  deleteChannel,
  getAgent,
  getAgentByChannelAndName,
  getAgentsByChannel,
  getAllChannels,
  getChannel,
  getMessagesByChannel,
  getMessagesAfter,
} from "./database.ts";
import { startAgent, stopAgent } from "../agent/worker-manager.ts";
import { DEFAULT_MODEL } from "../providers/anthropic.ts";
import { getProgress, getTokens, getTokensSince } from "../agent/progress.ts";
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

  // POST /channels/:id/messages/stream — save user message, wait for worker loop reply via SSE
  if (
    req.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "channels" &&
    parts[2] === "messages" &&
    parts[3] === "stream"
  ) {
    const channelId = parts[1];
    log(`[ROUTER] matched: POST /channels/:id/messages/stream — channelId="${channelId}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const agents = getAgentsByChannel(channelId);
    if (agents.length === 0) {
      log(`[ROUTER] no agents in channel "${channelId}"`);
      return json({ error: "no agents in channel" } satisfies ApiError, 409);
    }

    let body: CreateMessageBody;
    try {
      body = (await req.json()) as CreateMessageBody;
    } catch {
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    const text = body.text?.trim();
    if (!text) return json({ error: "text is required" } satisfies ApiError, 400);

    const userMessage: DbMessage = {
      id: crypto.randomUUID(),
      channel_id: channelId,
      text,
      role: "user",
      agent_name: "",
      created_at: Date.now(),
    };
    createMessage(userMessage);
    log(`[ROUTER] saved user message, waiting for worker loop reply`);

    // Poll DB for the worker loop's assistant reply (up to 120s)
    const POLL_INTERVAL_MS = 500;
    const KEEPALIVE_INTERVAL_MS = 10_000;
    const TIMEOUT_MS = 120_000;
    const cursor = userMessage.created_at;
    const { sseEvent, sseHeaders } = await import("./sse.ts");
    const encoder = new TextEncoder();
    const keepaliveComment = encoder.encode(": keepalive\n\n");

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const deadline = Date.now() + TIMEOUT_MS;
        let lastKeepalive = Date.now();
        let lastProgressJson = "";
        let lastTokenOffset = 0;

        while (Date.now() < deadline) {
          if (req.signal.aborted) break;

          // Emit progress events when worker status changes
          const progress = getProgress(channelId);
          const progressJson = JSON.stringify(progress);
          if (progress && progressJson !== lastProgressJson) {
            controller.enqueue(encoder.encode(sseEvent("progress", progress)));
            lastProgressJson = progressJson;
          }

          // Emit token delta if new text streamed in
          const tokenDelta = getTokensSince(channelId, lastTokenOffset);
          if (tokenDelta) {
            controller.enqueue(encoder.encode(sseEvent("token", { text: tokenDelta })));
            lastTokenOffset = getTokens(channelId).length;
          }

          const newMessages = getMessagesAfter(channelId, cursor);
          const reply = newMessages.find((m) => m.role === "assistant");

          if (reply) {
            controller.enqueue(encoder.encode(sseEvent("done", { message: reply })));
            controller.close();
            return;
          }

          if (Date.now() - lastKeepalive >= KEEPALIVE_INTERVAL_MS) {
            controller.enqueue(keepaliveComment);
            lastKeepalive = Date.now();
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        // Timed out — tell client so it can show error state
        controller.enqueue(encoder.encode(sseEvent("error", { error: "agent did not reply in time" })));
        controller.close();
      },
    });

    return new Response(stream, { status: 200, headers: sseHeaders });
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
      agent_name: "",
      created_at: Date.now(),
    };

    createMessage(msg);
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

  // DELETE /channels/:id — delete a channel and all its agents + messages
  if (
    req.method === "DELETE" &&
    parts.length === 2 &&
    parts[0] === "channels"
  ) {
    const channelId = parts[1];
    log(`[ROUTER] matched: DELETE /channels/:id — channelId="${channelId}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    // Stop all running agents in this channel before deleting
    const agents = getAgentsByChannel(channelId);
    for (const agent of agents) {
      stopAgent(agent.id);
    }

    deleteChannel(channelId);
    log(`[ROUTER] channel "${channelId}" deleted with ${agents.length} agent(s)`);

    return json({ message: "channel deleted" }, 200);
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
