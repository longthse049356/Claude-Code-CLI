# M10 Shadcn + SSE Chat Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 4 UI components to Shadcn style primitives and deliver true token-by-token assistant streaming to ChatPanel via SSE.

**Architecture:** Keep existing REST + WS behavior for channels/agents/logs, and add a dedicated SSE chat route for progressive assistant output. Backend exposes typed SSE events and streams Claude deltas; frontend parses SSE into a draft assistant message state before final persistence reconciliation. UI migration is incremental with behavior parity gates for ThemeToggle, ChannelPanel, AgentPanel, and ChatPanel.

**Tech Stack:** Bun, TypeScript, React, Vite, Zustand, TanStack Query, shadcn-style UI primitives, SSE (`text/event-stream`)

---

## File Map

### Backend
- Modify: `src/types.ts`
  - Add SSE event types for streaming chat.
- Modify: `src/providers/anthropic.ts`
  - Add streaming helper that yields text deltas.
- Modify: `src/server/router.ts`
  - Add `POST /channels/:id/messages/stream` SSE endpoint.
- Modify: `src/server/database.ts` (optional tiny helper only if needed)
  - Keep existing message persistence path; no schema change.

### Frontend
- Create: `packages/ui/src/stores/useThemeStore.ts`
  - Single source of truth for dark/light mode.
- Modify: `packages/ui/src/main.tsx`
  - First-paint theme bootstrap from store/localStorage/system preference.
- Modify: `packages/ui/src/types.ts`
  - Add SSE event payload types.
- Modify: `packages/ui/src/stores/useWsStore.ts`
  - Add draft assistant state + actions for streaming.
- Create: `packages/ui/src/hooks/useMessageStream.ts`
  - Parse SSE stream and dispatch draft/final actions.
- Create: `packages/ui/src/components/ui/button.tsx`
- Create: `packages/ui/src/components/ui/input.tsx`
- Create: `packages/ui/src/components/ui/card.tsx`
- Create: `packages/ui/src/components/ui/badge.tsx`
- Modify: `packages/ui/src/components/ThemeToggle.tsx`
- Modify: `packages/ui/src/components/ChannelPanel.tsx`
- Modify: `packages/ui/src/components/AgentPanel.tsx`
- Modify: `packages/ui/src/components/ChatPanel.tsx`

### Tests
- Create: `src/providers/anthropic.stream.test.ts`
  - Unit test text delta extraction.
- Create: `src/server/router.sse.test.ts`
  - Route-level SSE event shape and terminal event behavior.

---

### Task 1: Add backend SSE types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing type-usage test via compile check**

Add temporary usage in `src/server/router.ts` (top-level, for compile-only check):

```ts
const _sseTypeCheck: import("../types.ts").SseChatEvent = {
  type: "assistant_delta",
  data: { chunk: "hi" },
};
```

- [ ] **Step 2: Run typecheck and verify fail**

Run: `bun tsc --noEmit`
Expected: FAIL with `SseChatEvent` not found.

- [ ] **Step 3: Add SSE event types in `src/types.ts`**

```ts
export type SseChatEvent =
  | { type: "user_message_saved"; data: DbMessage }
  | { type: "assistant_start"; data: { id: string; channel_id: string; agent_name: string; created_at: number } }
  | { type: "assistant_delta"; data: { chunk: string } }
  | { type: "assistant_done"; data: DbMessage }
  | { type: "error"; data: { message: string } };
```

- [ ] **Step 4: Remove temporary compile-only snippet**

Delete `_sseTypeCheck` from `src/server/router.ts`.

- [ ] **Step 5: Re-run typecheck**

Run: `bun tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add SSE chat event types"
```

---

### Task 2: Add provider streaming helper (TDD)

**Files:**
- Create: `src/providers/anthropic.stream.test.ts`
- Modify: `src/providers/anthropic.ts`

- [ ] **Step 1: Write failing test for text delta extraction**

```ts
import { describe, expect, test } from "bun:test";
import { extractTextDelta } from "./anthropic.ts";

describe("extractTextDelta", () => {
  test("returns text for content_block_delta text events", () => {
    const evt = { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } };
    expect(extractTextDelta(evt)).toBe("Hello");
  });

  test("returns null for non-text events", () => {
    expect(extractTextDelta({ type: "message_start" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test and verify fail**

Run: `bun test src/providers/anthropic.stream.test.ts`
Expected: FAIL (`extractTextDelta` missing).

- [ ] **Step 3: Implement minimal helper + stream function**

Add to `src/providers/anthropic.ts`:

```ts
export function extractTextDelta(event: unknown): string | null {
  const e = event as { type?: string; delta?: { type?: string; text?: string } };
  if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && typeof e.delta.text === "string") {
    return e.delta.text;
  }
  return null;
}

export async function streamMessage(
  messages: Message[],
  options?: { model?: string; maxTokens?: number; systemPrompt?: string; signal?: AbortSignal },
): Promise<AsyncGenerator<string>> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 4096;
  const systemPrompt = options?.systemPrompt ?? "";

  const apiMessages = messages.map((msg) =>
    msg.role === "user"
      ? { role: "user" as const, content: msg.content }
      : {
          role: "assistant" as const,
          content: msg.content.map((b) =>
            b.type === "text"
              ? { type: "text" as const, text: b.text }
              : { type: "tool_use" as const, id: b.id, name: b.name, input: b.input },
          ),
        },
  );

  const stream = await client.messages.stream(
    { model, max_tokens: maxTokens, system: systemPrompt, messages: apiMessages },
    options?.signal ? { signal: options.signal } : undefined,
  );

  async function* gen(): AsyncGenerator<string> {
    for await (const event of stream) {
      const text = extractTextDelta(event);
      if (text) yield text;
    }
  }

  return gen();
}
```

- [ ] **Step 4: Re-run tests**

Run: `bun test src/providers/anthropic.stream.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/anthropic.ts src/providers/anthropic.stream.test.ts
git commit -m "feat(provider): add streaming text delta helper"
```

---

### Task 3: Add SSE route `POST /channels/:id/messages/stream` (TDD)

**Files:**
- Create: `src/server/router.sse.test.ts`
- Modify: `src/server/router.ts`

- [ ] **Step 1: Write failing route test**

```ts
import { beforeEach, expect, test } from "bun:test";
import { initDatabase, createChannel } from "./database.ts";
import { handleRequest } from "./router.ts";

beforeEach(() => {
  initDatabase(":memory:");
  createChannel("ch-1", "general", 1);
});

test("POST /channels/:id/messages/stream returns SSE headers", async () => {
  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const res = await handleRequest(req);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")?.includes("text/event-stream")).toBe(true);
});
```

- [ ] **Step 2: Run test and verify fail**

Run: `bun test src/server/router.sse.test.ts`
Expected: FAIL (route missing).

- [ ] **Step 3: Implement SSE route in `src/server/router.ts`**

Add imports:

```ts
import { streamMessage } from "../providers/anthropic.ts";
import { buildSystemPrompt } from "../agent/system-prompt.ts";
```

Add route block before existing `POST /channels/:id/messages`:

```ts
if (
  req.method === "POST" &&
  parts.length === 4 &&
  parts[0] === "channels" &&
  parts[2] === "messages" &&
  parts[3] === "stream"
) {
  const channelId = parts[1];
  const encoder = new TextEncoder();

  // parse body
  let body: CreateMessageBody;
  try {
    body = (await req.json()) as CreateMessageBody;
  } catch {
    return json({ error: "invalid JSON" } satisfies ApiError, 400);
  }

  if (!body.text?.trim()) {
    return json({ error: "text is required" } satisfies ApiError, 400);
  }

  const channel = getChannel(channelId);
  if (!channel) return json({ error: "channel not found" } satisfies ApiError, 404);

  const agents = getAgentsByChannel(channelId);
  if (agents.length === 0) {
    return json({ error: "no agents in channel" } satisfies ApiError, 400);
  }

  const agent = agents[0];

  const userMsg: DbMessage = {
    id: crypto.randomUUID(),
    channel_id: channelId,
    text: body.text.trim(),
    role: "user",
    agent_name: "",
    created_at: Date.now(),
  };
  createMessage(userMsg);
  broadcast({ type: "new_message", data: userMsg });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("user_message_saved", userMsg);

        const history = getMessagesByChannel(channelId).map((m): Message =>
          m.role === "user"
            ? { role: "user", content: m.text }
            : { role: "assistant", content: [{ type: "text", text: m.text }] },
        );

        const assistantId = crypto.randomUUID();
        const createdAt = Date.now();
        send("assistant_start", {
          id: assistantId,
          channel_id: channelId,
          agent_name: agent.name,
          created_at: createdAt,
        });

        let fullText = "";
        const deltas = await streamMessage(history, {
          model: agent.model,
          systemPrompt: buildSystemPrompt(agent.name, agent.system_prompt),
        });

        for await (const chunk of deltas) {
          fullText += chunk;
          send("assistant_delta", { chunk });
        }

        const assistantMsg: DbMessage = {
          id: assistantId,
          channel_id: channelId,
          text: fullText,
          role: "assistant",
          agent_name: agent.name,
          created_at: createdAt,
        };

        createMessage(assistantMsg);
        broadcast({ type: "new_message", data: assistantMsg });
        send("assistant_done", assistantMsg);
      } catch (error) {
        send("error", { message: String(error) });
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
```

- [ ] **Step 4: Re-run route test**

Run: `bun test src/server/router.sse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/router.ts src/server/router.sse.test.ts
git commit -m "feat(router): add SSE message streaming endpoint"
```

---

### Task 4: Add frontend SSE types and stream hook

**Files:**
- Modify: `packages/ui/src/types.ts`
- Create: `packages/ui/src/hooks/useMessageStream.ts`

- [ ] **Step 1: Add SSE event union in `packages/ui/src/types.ts`**

```ts
export type ChatSseEvent =
  | { type: "user_message_saved"; data: DbMessage }
  | { type: "assistant_start"; data: { id: string; channel_id: string; agent_name: string; created_at: number } }
  | { type: "assistant_delta"; data: { chunk: string } }
  | { type: "assistant_done"; data: DbMessage }
  | { type: "error"; data: { message: string } };
```

- [ ] **Step 2: Create `useMessageStream.ts`**

```ts
import { useCallback } from "react";
import type { ChatSseEvent } from "../types";
import { useWsStore } from "../stores/useWsStore";

export function useMessageStream(channelId: string | null) {
  const {
    addMessage,
    startAssistantDraft,
    appendAssistantDraft,
    finalizeAssistantDraft,
    failAssistantDraft,
  } = useWsStore();

  const sendStreamMessage = useCallback(async (text: string) => {
    if (!channelId) return;

    const res = await fetch(`/channels/${channelId}/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok || !res.body) throw new Error("Failed to start SSE stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processEvent = (raw: string) => {
      const lines = raw.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event:"));
      const dataLine = lines.find((l) => l.startsWith("data:"));
      if (!eventLine || !dataLine) return;

      const type = eventLine.replace("event:", "").trim() as ChatSseEvent["type"];
      const data = JSON.parse(dataLine.replace("data:", "").trim()) as ChatSseEvent["data"];

      if (type === "user_message_saved") addMessage(data as any);
      if (type === "assistant_start") startAssistantDraft(data as any);
      if (type === "assistant_delta") appendAssistantDraft((data as any).chunk);
      if (type === "assistant_done") finalizeAssistantDraft(data as any);
      if (type === "error") failAssistantDraft((data as any).message);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      chunks.forEach(processEvent);
    }
  }, [channelId, addMessage, startAssistantDraft, appendAssistantDraft, finalizeAssistantDraft, failAssistantDraft]);

  return { sendStreamMessage };
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/ui && bun run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/types.ts packages/ui/src/hooks/useMessageStream.ts
git commit -m "feat(ui): add typed SSE stream hook for chat"
```

---

### Task 5: Extend UI store for assistant draft streaming

**Files:**
- Modify: `packages/ui/src/stores/useWsStore.ts`

- [ ] **Step 1: Add draft types and actions**

Replace store shape with:

```ts
interface AssistantDraft {
  id: string;
  channel_id: string;
  agent_name: string;
  created_at: number;
  text: string;
  error?: string;
}

interface WsState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
  messages: DbMessage[];
  addMessage: (msg: DbMessage) => void;
  setMessages: (msgs: DbMessage[]) => void;
  typingAgents: Set<string>;
  addTypingAgent: (channel_id: string, agent_name: string) => void;
  removeTypingAgent: (channel_id: string, agent_name: string) => void;

  assistantDraft: AssistantDraft | null;
  startAssistantDraft: (draft: Omit<AssistantDraft, "text">) => void;
  appendAssistantDraft: (chunk: string) => void;
  finalizeAssistantDraft: (msg: DbMessage) => void;
  failAssistantDraft: (message: string) => void;
}
```

Implementation additions:

```ts
assistantDraft: null,
startAssistantDraft: (draft) => set({ assistantDraft: { ...draft, text: "" } }),
appendAssistantDraft: (chunk) =>
  set((state) =>
    state.assistantDraft
      ? { assistantDraft: { ...state.assistantDraft, text: state.assistantDraft.text + chunk } }
      : state,
  ),
finalizeAssistantDraft: (msg) =>
  set((state) => ({
    assistantDraft: null,
    messages: state.messages.some((m) => m.id === msg.id) ? state.messages : [...state.messages, msg],
  })),
failAssistantDraft: (message) =>
  set((state) =>
    state.assistantDraft ? { assistantDraft: { ...state.assistantDraft, error: message } } : state,
  ),
```

- [ ] **Step 2: Run UI build**

Run: `cd packages/ui && bun run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/stores/useWsStore.ts
git commit -m "feat(ui-store): add assistant draft state for SSE streaming"
```

---

### Task 6: Theme source-of-truth + ThemeToggle migration

**Files:**
- Create: `packages/ui/src/stores/useThemeStore.ts`
- Modify: `packages/ui/src/main.tsx`
- Modify: `packages/ui/src/components/ThemeToggle.tsx`

- [ ] **Step 1: Create theme store**

```ts
import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",
  setTheme: (theme) => {
    set({ theme });
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
}));
```

- [ ] **Step 2: Bootstrap theme in `main.tsx` before render**

```ts
import { useThemeStore } from "./stores/useThemeStore";

const saved = localStorage.getItem("theme") as "light" | "dark" | null;
const initial = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
useThemeStore.getState().setTheme(initial);
```

- [ ] **Step 3: Migrate `ThemeToggle.tsx` to store-driven Button API**

Use Shadcn button once added in Task 7:

```tsx
import { Sun, Moon } from "lucide-react";
import { Button } from "./ui/button";
import { useThemeStore } from "../stores/useThemeStore";

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <Button variant="outline" size="icon" onClick={toggleTheme} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd packages/ui && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/stores/useThemeStore.ts packages/ui/src/main.tsx packages/ui/src/components/ThemeToggle.tsx
git commit -m "feat(ui-theme): centralize theme state and migrate ThemeToggle"
```

---

### Task 7: Add minimal shadcn-style primitives used by panels

**Files:**
- Create: `packages/ui/src/components/ui/button.tsx`
- Create: `packages/ui/src/components/ui/input.tsx`
- Create: `packages/ui/src/components/ui/card.tsx`
- Create: `packages/ui/src/components/ui/badge.tsx`

- [ ] **Step 1: Add `button.tsx`**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-input bg-background hover:bg-accent",
        ghost: "hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

- [ ] **Step 2: Add `input.tsx`, `card.tsx`, `badge.tsx`**

`input.tsx`:

```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

`card.tsx`:

```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card text-card-foreground", className)} {...props} />;
}
```

`badge.tsx`:

```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", className)} {...props} />;
}
```

- [ ] **Step 3: Build verify**

Run: `cd packages/ui && bun run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ui/button.tsx packages/ui/src/components/ui/input.tsx packages/ui/src/components/ui/card.tsx packages/ui/src/components/ui/badge.tsx
git commit -m "feat(ui): add minimal shadcn-style primitives"
```

---

### Task 8: Migrate `ChannelPanel` + `AgentPanel` to Shadcn primitives

**Files:**
- Modify: `packages/ui/src/components/ChannelPanel.tsx`
- Modify: `packages/ui/src/components/AgentPanel.tsx`

- [ ] **Step 1: Update imports and controls in `ChannelPanel.tsx`**

Use:

```tsx
import { Button } from "./ui/button";
import { Input } from "./ui/input";
```

Replace form controls (`<input>`, submit `<button>`) with `Input` and `Button size="icon"`.

- [ ] **Step 2: Remove inline style for sidebar row/background**

Replace inline `style={...}` blocks with class-based tokens using `cn` only, e.g.:

```tsx
className={cn(
  "w-full flex items-center gap-2 px-4 py-2 text-sm border-l-2 transition-colors",
  isActive
    ? "border-l-primary bg-accent text-accent-foreground font-medium"
    : "border-l-transparent text-sidebar-foreground hover:bg-accent"
)}
```

- [ ] **Step 3: Migrate `AgentPanel.tsx` cards and controls**

Use `Input`, `Button`, `Card`, `Badge` imports and replace raw wrappers:

```tsx
<Card key={agent.id} className="p-3">
  ...
  <Badge className={thinking ? "text-amber-500" : "text-emerald-500"}>
    {thinking ? "Thinking" : "Idle"}
  </Badge>
</Card>
```

- [ ] **Step 4: Build verify**

Run: `cd packages/ui && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ChannelPanel.tsx packages/ui/src/components/AgentPanel.tsx
git commit -m "refactor(ui): migrate channel and agent panels to shadcn primitives"
```

---

### Task 9: Migrate `ChatPanel` to SSE send flow + Shadcn controls

**Files:**
- Modify: `packages/ui/src/components/ChatPanel.tsx`
- Modify: `packages/ui/src/hooks/useMessages.ts` (only if needed for reconcile behavior)

- [ ] **Step 1: Replace send flow with `useMessageStream` hook**

In `ChatPanel.tsx`:

```tsx
import { useMessageStream } from "../hooks/useMessageStream";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const { sendStreamMessage } = useMessageStream(selectedChannelId);
```

Submit handler:

```tsx
const sendMessage = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!inputValue.trim() || !selectedChannelId || isSending) return;
  setIsSending(true);
  try {
    await sendStreamMessage(inputValue.trim());
    setInputValue("");
  } finally {
    setIsSending(false);
  }
};
```

- [ ] **Step 2: Render draft assistant bubble from store**

Read from `useWsStore((s) => s.assistantDraft)` and append bubble when channel matches:

```tsx
{assistantDraft && assistantDraft.channel_id === selectedChannelId && (
  <div className="flex gap-2.5 max-w-[80%]">
    ...
    <div className="px-3 py-2 rounded-xl rounded-tl-sm text-sm bg-[hsl(var(--bubble-assistant))] text-[hsl(var(--bubble-assistant-foreground))]">
      {assistantDraft.text || "..."}
    </div>
  </div>
)}
```

- [ ] **Step 3: Keep existing WS typing indicator path**

Do not remove existing `typingAgents` UI in this task.

- [ ] **Step 4: Build verify**

Run: `cd packages/ui && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ChatPanel.tsx packages/ui/src/hooks/useMessages.ts
git commit -m "feat(chat): wire SSE streaming and draft assistant bubble"
```

---

### Task 10: End-to-end verification gates

**Files:**
- Modify: none

- [ ] **Step 1: Backend tests**

Run: `bun test src/providers/anthropic.stream.test.ts src/server/router.sse.test.ts`
Expected: PASS.

- [ ] **Step 2: Typecheck backend**

Run: `bun tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build frontend**

Run: `cd packages/ui && bun run build`
Expected: PASS.

- [ ] **Step 4: Manual UX validation**

Run server/UI and verify:

```bash
bun run dev:server
bun run dev:ui
```

Expected:
1. Theme persists across reload without flash mismatch.
2. ChannelPanel and AgentPanel behavior unchanged.
3. Sending chat message shows progressive assistant text before completion.
4. Final assistant message persists after refresh.
5. No duplicate assistant bubbles.

- [ ] **Step 5: Final commit**

```bash
git add src/types.ts src/providers/anthropic.ts src/server/router.ts src/providers/anthropic.stream.test.ts src/server/router.sse.test.ts packages/ui/src/types.ts packages/ui/src/stores/useWsStore.ts packages/ui/src/hooks/useMessageStream.ts packages/ui/src/stores/useThemeStore.ts packages/ui/src/main.tsx packages/ui/src/components/ui/button.tsx packages/ui/src/components/ui/input.tsx packages/ui/src/components/ui/card.tsx packages/ui/src/components/ui/badge.tsx packages/ui/src/components/ThemeToggle.tsx packages/ui/src/components/ChannelPanel.tsx packages/ui/src/components/AgentPanel.tsx packages/ui/src/components/ChatPanel.tsx
git commit -m "feat(m10-ui): migrate to shadcn primitives and add SSE chat streaming"
```

---

## Self-Review

- Spec coverage: includes selected approach (incremental), 4-component migration, theme stabilization, SSE end-to-end, and verification gates.
- Placeholder scan: no TBD/TODO markers, each task has concrete file paths, commands, and code snippets.
- Type consistency: backend/frontend SSE event names aligned (`user_message_saved`, `assistant_start`, `assistant_delta`, `assistant_done`, `error`).
