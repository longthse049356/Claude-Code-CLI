# Assistant-only SSE Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WebSocket realtime flow with assistant-response SSE streaming (`token`/`done`/`error`) and persist assistant message only after successful stream completion.

**Architecture:** Keep existing channel/agent/message DB model. Add a dedicated SSE message-stream route that saves user input, streams assistant tokens to client, then saves one final assistant message on success. Remove all WS client/server wiring and typing-indicator dependencies from UI/server.

**Tech Stack:** Bun server (`Bun.serve`), TypeScript, `@anthropic-ai/sdk` stream API, React + Zustand + TanStack Query.

---

## File Structure (planned changes)

- **Create:** `src/server/sse.ts`
  - Single responsibility: format SSE events (`token`, `done`, `error`) and stream headers.
- **Create:** `src/server/sse.test.ts`
  - Unit tests for SSE encoder output format.
- **Create:** `src/server/stream-message.ts`
  - Single responsibility: handle `POST /channels/:id/messages/stream` flow (validate, persist user, stream LLM, persist final assistant).
- **Create:** `src/server/stream-message.test.ts`
  - Unit tests with fake streamer to verify persistence + event semantics.
- **Modify:** `src/providers/anthropic.ts`
  - Add streaming function that emits text tokens and returns final text.
- **Modify:** `src/server/router.ts`
  - Route new SSE endpoint; remove WS broadcast side effects from message route.
- **Modify:** `src/server.ts`
  - Remove `/ws` upgrade branch and websocket registration.
- **Delete:** `src/server/websocket.ts`
- **Modify:** `src/agent/worker-loop.ts`
  - Remove WS typing/new_message broadcasts (DB behavior remains).
- **Modify:** `src/types.ts`
  - Remove `WsBroadcast`; add SSE payload types if needed.
- **Modify:** `packages/ui/src/components/ChatPanel.tsx`
  - Send message through streaming endpoint, render draft assistant token-by-token, handle `done`/`error`, retry.
- **Modify:** `packages/ui/src/components/AgentPanel.tsx`
  - Remove WS typing dependency and UI typing indicator.
- **Modify:** `packages/ui/src/hooks/useMessages.ts`
  - Remove WS store dependency; source from React Query + local panel state.
- **Modify:** `packages/ui/src/App.tsx`
  - Remove `useWebSocket` and connection badge.
- **Modify:** `packages/ui/src/types.ts`
  - Remove `WsBroadcast` mirror type.
- **Delete:** `packages/ui/src/hooks/useWebSocket.ts`
- **Delete:** `packages/ui/src/stores/useWsStore.ts`

---

### Task 1: Add SSE primitives with tests

**Files:**
- Create: `src/server/sse.ts`
- Test: `src/server/sse.test.ts`

- [ ] **Step 1: Write failing tests for SSE formatting**

```ts
// src/server/sse.test.ts
import { expect, test } from "bun:test";
import { sseEvent, sseHeaders } from "./sse.ts";

test("sseEvent formats named event with JSON payload", () => {
  const chunk = sseEvent("token", { text: "Hi" });
  expect(chunk).toBe('event: token\ndata: {"text":"Hi"}\n\n');
});

test("sseHeaders include text/event-stream essentials", () => {
  expect(sseHeaders["Content-Type"]).toBe("text/event-stream");
  expect(sseHeaders["Cache-Control"]).toBe("no-cache");
  expect(sseHeaders["Connection"]).toBe("keep-alive");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/sse.test.ts`
Expected: FAIL with module/function-not-found errors.

- [ ] **Step 3: Implement minimal SSE helpers**

```ts
// src/server/sse.ts
export const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

export function sseEvent(event: "token" | "done" | "error", payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `bun test src/server/sse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/sse.ts src/server/sse.test.ts
git commit -m "test(server): add SSE event encoder primitives"
```

---

### Task 2: Implement stream-message server flow (TDD)

**Files:**
- Create: `src/server/stream-message.ts`
- Test: `src/server/stream-message.test.ts`
- Modify: `src/server/database.ts` (only if tiny helper export is needed)

- [ ] **Step 1: Write failing behavior tests for stream-message flow**

```ts
// src/server/stream-message.test.ts
import { expect, test } from "bun:test";
import { initDatabase, createChannel, getMessagesByChannel } from "./database.ts";
import { handleStreamMessage } from "./stream-message.ts";

test("success: stores user message, streams tokens, stores one assistant message", async () => {
  initDatabase(":memory:");
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const response = await handleStreamMessage(req, "ch-1", {
    agentName: "assistant",
    streamAssistantText: async ({ onToken }) => {
      onToken("Hi");
      onToken(" there");
      return "Hi there";
    },
  });

  expect(response.headers.get("Content-Type")).toContain("text/event-stream");

  const body = await response.text();
  expect(body).toContain("event: token");
  expect(body).toContain("event: done");

  const msgs = getMessagesByChannel("ch-1");
  expect(msgs).toHaveLength(2);
  expect(msgs[0].role).toBe("user");
  expect(msgs[1].role).toBe("assistant");
  expect(msgs[1].text).toBe("Hi there");
});

test("failure mid-stream: emits error and does not store assistant message", async () => {
  initDatabase(":memory:");
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const response = await handleStreamMessage(req, "ch-1", {
    agentName: "assistant",
    streamAssistantText: async ({ onToken }) => {
      onToken("partial");
      throw new Error("upstream failed");
    },
  });

  const body = await response.text();
  expect(body).toContain("event: error");

  const msgs = getMessagesByChannel("ch-1");
  expect(msgs).toHaveLength(1);
  expect(msgs[0].role).toBe("user");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/stream-message.test.ts`
Expected: FAIL with missing module/function.

- [ ] **Step 3: Implement minimal stream-message handler**

```ts
// src/server/stream-message.ts
import type { ApiError, CreateMessageBody, DbMessage } from "../types.ts";
import { createMessage, getChannel } from "./database.ts";
import { sseEvent, sseHeaders } from "./sse.ts";

type StreamDeps = {
  agentName: string;
  streamAssistantText: (args: {
    userText: string;
    channelId: string;
    onToken: (text: string) => void;
    signal: AbortSignal;
  }) => Promise<string>;
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error } satisfies ApiError), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleStreamMessage(req: Request, channelId: string, deps: StreamDeps): Promise<Response> {
  let body: CreateMessageBody;
  try {
    body = (await req.json()) as CreateMessageBody;
  } catch {
    return jsonError("invalid JSON", 400);
  }

  if (!body.text || body.text.trim() === "") return jsonError("text is required", 400);
  if (!getChannel(channelId)) return jsonError("channel not found", 404);

  const userMessage: DbMessage = {
    id: crypto.randomUUID(),
    channel_id: channelId,
    text: body.text.trim(),
    role: "user",
    agent_name: "",
    created_at: Date.now(),
  };
  createMessage(userMessage);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const finalText = await deps.streamAssistantText({
          userText: userMessage.text,
          channelId,
          signal: req.signal,
          onToken: (text) => controller.enqueue(encoder.encode(sseEvent("token", { text }))),
        });

        const assistant: DbMessage = {
          id: crypto.randomUUID(),
          channel_id: channelId,
          text: finalText,
          role: "assistant",
          agent_name: deps.agentName,
          created_at: Date.now(),
        };
        createMessage(assistant);

        controller.enqueue(encoder.encode(sseEvent("done", { message: assistant })));
      } catch (error) {
        controller.enqueue(encoder.encode(sseEvent("error", { error: (error as Error).message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `bun test src/server/stream-message.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/stream-message.ts src/server/stream-message.test.ts
git commit -m "feat(server): add assistant SSE stream message handler"
```

---

### Task 3: Wire Anthropic streaming + route integration

**Files:**
- Modify: `src/providers/anthropic.ts`
- Modify: `src/server/router.ts`
- Modify: `src/types.ts`
- Modify: `src/agent/worker-loop.ts`

- [ ] **Step 1: Write failing router integration test with fake deps**

```ts
// add to src/server/stream-message.test.ts
import { handleRequest } from "./router.ts";

test("POST /channels/:id/messages/stream routes to SSE handler", async () => {
  initDatabase(":memory:");
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const response = await handleRequest(req);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/event-stream");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/stream-message.test.ts`
Expected: FAIL (route not found / wrong content-type).

- [ ] **Step 3: Implement streaming provider and route wiring**

```ts
// src/providers/anthropic.ts
export async function streamAssistantText(
  messages: Message[],
  options: {
    model?: string;
    maxTokens?: number;
    systemPrompt?: string;
    signal?: AbortSignal;
    onToken: (text: string) => void;
  }
): Promise<string> {
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? 4096;

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: options.systemPrompt ?? "",
      messages: messages.map((msg) =>
        msg.role === "user"
          ? { role: "user" as const, content: msg.content }
          : { role: "assistant" as const, content: msg.content.map((b) => ({ type: "text" as const, text: b.type === "text" ? b.text : "" })).filter((b) => b.text !== "") }
      ),
    },
    options.signal ? { signal: options.signal } : undefined
  );

  let full = "";
  for await (const token of stream.textStream) {
    full += token;
    options.onToken(token);
  }
  return full;
}
```

```ts
// src/server/router.ts (new route)
import { handleStreamMessage } from "./stream-message.ts";
import { streamAssistantText, DEFAULT_MODEL } from "../providers/anthropic.ts";
import { buildSystemPrompt } from "../agent/system-prompt.ts";
import { getAgentsByChannel, getMessagesByChannel } from "./database.ts";

if (
  req.method === "POST" &&
  parts.length === 4 &&
  parts[0] === "channels" &&
  parts[2] === "messages" &&
  parts[3] === "stream"
) {
  const channelId = parts[1];
  const agents = getAgentsByChannel(channelId);
  if (agents.length === 0) return json({ error: "no agents in channel" }, 409);
  const agent = agents[0];

  return handleStreamMessage(req, channelId, {
    agentName: agent.name,
    streamAssistantText: async ({ userText, signal }) => {
      const history = getMessagesByChannel(channelId);
      const messages: Message[] = [
        ...history.map((m) =>
          m.role === "user"
            ? { role: "user", content: m.text }
            : { role: "assistant", content: [{ type: "text", text: m.text }] }
        ),
        { role: "user", content: userText },
      ];
      return streamAssistantText(messages, {
        model: agent.model ?? DEFAULT_MODEL,
        systemPrompt: buildSystemPrompt(agent.name, agent.system_prompt),
        signal,
        onToken: () => {},
      });
    },
  });
}
```

```ts
// src/agent/worker-loop.ts
// remove:
// broadcast({ type: "typing", ... })
// broadcast({ type: "new_message", ... })
```

```ts
// src/types.ts
// remove WsBroadcast type block
```

- [ ] **Step 4: Re-run backend tests**

Run: `bun test src/server/sse.test.ts src/server/stream-message.test.ts src/server/database.test.ts src/agent/system-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/anthropic.ts src/server/router.ts src/types.ts src/agent/worker-loop.ts
git commit -m "feat(server): wire assistant SSE route to Anthropic stream"
```

---

### Task 4: Remove WebSocket server bootstrap and files

**Files:**
- Modify: `src/server.ts`
- Delete: `src/server/websocket.ts`

- [ ] **Step 1: Write failing regression test (no /ws handling expected)**

```ts
// add test in src/server/stream-message.test.ts
import { handleRequest } from "./router.ts";

test("GET /ws no longer upgrades and returns not found", async () => {
  const res = await handleRequest(new Request("http://localhost/ws", { method: "GET" }));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/server/stream-message.test.ts`
Expected: FAIL while /ws upgrade path still exists in bootstrap.

- [ ] **Step 3: Remove WS bootstrap and module**

```ts
// src/server.ts
import { initDatabase } from "./server/database.ts";
import { handleRequest } from "./server/router.ts";
import { resumeAll } from "./agent/worker-manager.ts";

initDatabase();
resumeAll();

Bun.serve({
  port: 3456,
  fetch(req) {
    return handleRequest(req);
  },
});
```

Also delete `src/server/websocket.ts` and remove related imports/usages.

- [ ] **Step 4: Run server tests**

Run: `bun test src/server/*.test.ts src/agent/system-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/server/websocket.ts
git commit -m "refactor(server): remove websocket transport"
```

---

### Task 5: Migrate UI ChatPanel to SSE stream + retry

**Files:**
- Modify: `packages/ui/src/components/ChatPanel.tsx`
- Modify: `packages/ui/src/hooks/useMessages.ts`
- Modify: `packages/ui/src/components/AgentPanel.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/types.ts`
- Delete: `packages/ui/src/hooks/useWebSocket.ts`
- Delete: `packages/ui/src/stores/useWsStore.ts`

- [ ] **Step 1: Add failing UI parser test (SSE parser utility)**

```ts
// packages/ui/src/lib/sse.test.ts
import { expect, test } from "bun:test";
import { parseSseChunk } from "./sse";

test("parseSseChunk parses named event + JSON", () => {
  const result = parseSseChunk('event: token\ndata: {"text":"Hi"}\n\n');
  expect(result).toEqual({ event: "token", data: { text: "Hi" } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/ui/src/lib/sse.test.ts`
Expected: FAIL (missing module/function).

- [ ] **Step 3: Implement minimal parser + ChatPanel stream state**

```ts
// packages/ui/src/lib/sse.ts
export function parseSseChunk(chunk: string): { event: "token" | "done" | "error"; data: any } {
  const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
  const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
  if (!eventLine || !dataLine) throw new Error("invalid SSE chunk");
  const event = eventLine.slice(6).trim() as "token" | "done" | "error";
  const data = JSON.parse(dataLine.slice(5).trim());
  return { event, data };
}
```

```tsx
// ChatPanel.tsx (core flow)
const [draftAssistant, setDraftAssistant] = useState<{ text: string; failed: boolean } | null>(null);

const sendMessage = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!inputValue.trim() || !selectedChannelId || isSending) return;

  const text = inputValue.trim();
  setIsSending(true);
  setDraftAssistant({ text: "", failed: false });

  const res = await fetch(`/channels/${selectedChannelId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok || !res.body) {
    setDraftAssistant((s) => (s ? { ...s, failed: true } : { text: "", failed: true }));
    setIsSending(false);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const { event, data } = parseSseChunk(`${chunk}\n\n`);
      if (event === "token") {
        setDraftAssistant((s) => ({ text: (s?.text ?? "") + data.text, failed: false }));
      } else if (event === "done") {
        await queryClient.invalidateQueries({ queryKey: ["messages", selectedChannelId] });
        setDraftAssistant(null);
      } else {
        setDraftAssistant((s) => ({ text: s?.text ?? "", failed: true }));
      }
    }
  }

  setInputValue("");
  setIsSending(false);
};
```

Also remove typing-indicator + connection badge references tied to `useWsStore`.

- [ ] **Step 4: Run UI build verification**

Run: `cd packages/ui && bun run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ChatPanel.tsx packages/ui/src/hooks/useMessages.ts packages/ui/src/components/AgentPanel.tsx packages/ui/src/App.tsx packages/ui/src/types.ts packages/ui/src/lib/sse.ts packages/ui/src/lib/sse.test.ts packages/ui/src/hooks/useWebSocket.ts packages/ui/src/stores/useWsStore.ts
git commit -m "feat(ui): switch chat rendering to assistant SSE streaming"
```

---

### Task 6: End-to-end verification and cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-04-18-m10-assistant-sse-design.md` (checklist update only)

- [ ] **Step 1: Run backend + UI checks**

Run:
```bash
bun test src/server/sse.test.ts src/server/stream-message.test.ts src/server/database.test.ts src/agent/system-prompt.test.ts
cd packages/ui && bun run build
```
Expected: all tests pass, UI build passes.

- [ ] **Step 2: Manual runtime verification**

Run: `bun run dev`

Manual checks:
1. Create/select channel, add one agent.
2. Send message and confirm assistant response appears progressively.
3. Confirm DB has exactly one new assistant row after completion.
4. Simulate upstream failure (temporary invalid API key), confirm partial draft is shown failed and no assistant partial persisted.

- [ ] **Step 3: Update spec acceptance checklist status**

Mark completed checkboxes in:
`docs/superpowers/specs/2026-04-18-m10-assistant-sse-design.md`

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/specs/2026-04-18-m10-assistant-sse-design.md
git commit -m "chore: verify assistant-only SSE migration acceptance criteria"
```

---

## Self-Review

### 1) Spec coverage check
- Remove WS: covered by Tasks 3, 4, 5.
- SSE endpoint + `token|done|error`: covered by Tasks 1, 2, 3.
- Token-by-token UI rendering: covered by Task 5.
- Persist assistant only on successful completion: covered by Task 2.
- Failure keeps partial only in UI and no DB partial: covered by Tasks 2 and 5.
- Existing channel flows unchanged: verified in Task 6.

### 2) Placeholder scan
- No TBD/TODO placeholders.
- All tasks include concrete files, code, commands, expected outcomes.

### 3) Type consistency check
- SSE event names are consistently `token`, `done`, `error`.
- Message persistence contract consistently uses `DbMessage` with one assistant row on success only.
- Stream route path consistent: `POST /channels/:id/messages/stream`.
