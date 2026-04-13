import type { Agent, ApiError, Channel, CreateAgentBody, CreateChannelBody, CreateMessageBody, DbMessage } from "../types.ts";
import {
  createAgent,
  createChannel,
  createMessage,
  deleteAgent,
  getAgent,
  getAgentByChannelAndName,
  getChannel,
  getMessagesByChannel,
} from "./database.ts";
import { broadcast } from "./websocket.ts";
import { startAgent, stopAgent } from "../agent/worker-manager.ts";
import { DEFAULT_MODEL } from "../providers/anthropic.ts";

function json(data: unknown, status = 200): Response {
  console.log(`[ROUTER] → response ${status}: ${JSON.stringify(data)}`);
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
    console.log(`[ROUTER] matched: POST /channels`);

    let body: CreateChannelBody;
    try {
      body = (await req.json()) as CreateChannelBody;
      console.log(`[ROUTER] body: ${JSON.stringify(body)}`);
    } catch {
      console.log(`[ROUTER] body parse FAILED — invalid JSON`);
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.name || body.name.trim() === "") {
      console.log(`[ROUTER] validation FAILED — name is required`);
      return json({ error: "name is required" } satisfies ApiError, 400);
    }

    const id = crypto.randomUUID();
    const created_at = Date.now();
    createChannel(id, body.name.trim(), created_at);

    return json({ id, name: body.name.trim(), created_at } satisfies Channel, 201);
  }

  // GET /channels/:id/messages — list messages in a channel
  if (
    req.method === "GET" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "messages"
  ) {
    const channelId = parts[1];
    console.log(`[ROUTER] matched: GET /channels/:id/messages — channelId="${channelId}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      console.log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const messages = getMessagesByChannel(channelId);
    console.log(`[ROUTER] returning ${messages.length} message(s)`);
    return json(messages);
  }

  // POST /channels/:id/messages — send a message to a channel
  if (
    req.method === "POST" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "messages"
  ) {
    const channelId = parts[1];
    console.log(`[ROUTER] matched: POST /channels/:id/messages — channelId="${channelId}"`);

    let body: CreateMessageBody;
    try {
      body = (await req.json()) as CreateMessageBody;
      console.log(`[ROUTER] body: ${JSON.stringify(body)}`);
    } catch {
      console.log(`[ROUTER] body parse FAILED — invalid JSON`);
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.text || body.text.trim() === "") {
      console.log(`[ROUTER] validation FAILED — text is required`);
      return json({ error: "text is required" } satisfies ApiError, 400);
    }

    const channel = getChannel(channelId);
    if (!channel) {
      console.log(`[ROUTER] channel "${channelId}" NOT FOUND`);
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
    console.log(`[ROUTER] broadcasting to WS clients...`);
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
    console.log(`[ROUTER] matched: POST /channels/:id/agents — channelId="${channelId}"`);

    let body: CreateAgentBody;
    try {
      body = (await req.json()) as CreateAgentBody;
      console.log(`[ROUTER] body: ${JSON.stringify(body)}`);
    } catch {
      console.log(`[ROUTER] body parse FAILED — invalid JSON`);
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.name || body.name.trim() === "") {
      console.log(`[ROUTER] validation FAILED — name is required`);
      return json({ error: "name is required" } satisfies ApiError, 400);
    }

    const channel = getChannel(channelId);
    if (!channel) {
      console.log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const existing = getAgentByChannelAndName(channelId, body.name.trim());
    if (existing) {
      console.log(`[ROUTER] agent "${body.name.trim()}" already exists in channel "${channelId}"`);
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
    console.log(`[ROUTER] agent "${agent.name}" created and started`);

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
    console.log(`[ROUTER] matched: DELETE /channels/:id/agents/:name — channelId="${channelId}" name="${agentName}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      console.log(`[ROUTER] channel "${channelId}" NOT FOUND`);
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const agent = getAgentByChannelAndName(channelId, agentName);
    if (!agent) {
      console.log(`[ROUTER] agent "${agentName}" NOT FOUND in channel "${channelId}"`);
      return json({ error: "agent not found" } satisfies ApiError, 404);
    }

    stopAgent(agent.id);
    deleteAgent(agent.id);
    console.log(`[ROUTER] agent "${agentName}" stopped and deleted`);

    return json({ message: "agent stopped" }, 200);
  }

  // No route matched
  console.log(`[ROUTER] no route matched for ${req.method} ${url.pathname}`);
  return json({ error: "not found" } satisfies ApiError, 404);
}
