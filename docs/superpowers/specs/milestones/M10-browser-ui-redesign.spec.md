# M10 Redesign Spec: AI-Native UI + Dark Mode (v2)

> Updated: 2026-04-20
> Based on: `M10-browser-ui-redesign.spec.md` v1 + actual implementation
> Status: SSE mode (WebSocket removed)

---

## Overview

UI hiện tại đã implement theo 3 plan files:
- **2026-04-14-m10-lite-ui**: Shadcn, stores, hooks, components ✅
- **2026-04-18-m10-assistant-sse**: SSE streaming, WebSocket removed ✅
- **2026-04-20-m10-shadcn-migration**: Button/Input/Card migration ✅

Spec này cập nhật lại để phản ánh thực tế implementation + thêm design system AI-Native.

---

## 1. What's Already Done

| Feature | Status | Notes |
|---------|--------|-------|
| Shadcn components | ✅ | Button, Input, Card, Badge, ScrollArea, Separator |
| SSE streaming | ✅ | `POST /channels/:id/messages/stream` → token/done/error |
| ChatPanel streaming | ✅ | Draft assistant state, readSseStream from `lib/sse.ts` |
| useChannels, useMessages, useAgents | ✅ | TanStack Query hooks |
| LogPanel | ✅ | Server log streaming via polling/fetch |
| ThemeToggle | ✅ | Sun/Moon icons, localStorage persistence |
| AgentPanel | ✅ | shadcn Card, Button, status badge |

---

## 2. Design System (TODO)

### CSS Variables — AI-Native UI

**Light Mode:**
```css
:root {
  --primary: 262 80% 58%;           /* #7C3AED - AI Purple */
  --primary-foreground: 0 0% 100%;
  --secondary: 262 70% 70%;         /* #A78BFA - light purple */
  --accent: 187 90% 47%;             /* #06B6D4 - Cyan */
  --accent-foreground: 0 0% 100%;
  --background: 270 60% 98%;         /* #FAF5FF - soft purple tint */
  --foreground: 250 50% 8%;          /* #1E1B4B - dark indigo */
  --muted: 270 30% 92%;
  --muted-foreground: 250 20% 45%;
  --border: 270 20% 85%;
  --card: 0 0% 100%;
  --destructive: 0 84% 60%;
  --bubble-user: 262 80% 95%;
  --bubble-assistant: 270 20% 95%;
  --sidebar: 270 40% 96%;
  --sidebar-foreground: 250 50% 8%;
  --sidebar-active: 262 80% 92%;
  --sidebar-active-foreground: 262 80% 40%;
  --radius: 0.5rem;
}
```

**Dark Mode:**
```css
.dark {
  --primary: 215 28% 17%;           /* #1E293B - Dark Slate */
  --primary-foreground: 210 40% 98%;
  --secondary: 215 25% 22%;          /* #334155 */
  --accent: 142 71% 45%;             /* #22C55E - Run Green */
  --accent-foreground: 0 0% 0%;
  --background: 222 47% 6%;          /* #0F172A - Deep Dark */
  --foreground: 210 40% 98%;         /* #F8FAFC - near white */
  --muted: 217 33% 14%;
  --muted-foreground: 215 20% 55%;
  --border: 217 33% 18%;
  --card: 222 47% 8%;
  --destructive: 0 63% 55%;
  --bubble-user: 215 28% 18%;
  --bubble-assistant: 217 33% 14%;
  --sidebar: 222 47% 8%;
  --sidebar-foreground: 210 40% 90%;
  --sidebar-active: 215 28% 15%;
  --sidebar-active-foreground: 215 28% 68%;
}
```

### Typography

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

code, pre, .font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}
```

---

## 3. Data Structures

```typescript
// packages/ui/src/types.ts

export interface Channel {
  id: string;
  name: string;
  created_at: number;
}

export interface Agent {
  id: string;
  name: string;
  channel_id: string;
  model: string;
  system_prompt: string;
  last_processed_at: number;
  created_at: number;
}

export interface DbMessage {
  id: string;
  channel_id: string;
  text: string;
  role: "user" | "assistant";
  agent_name: string;
  created_at: number;
}
```

---

## 4. File Specifications

### `packages/ui/src/App.css` — Update Design System

**Status:** TODO — cần update với AI-Native colors

Thay thế nội dung hiện tại bằng CSS variables ở section 2.

---

### `packages/ui/src/stores/useAppStore.ts` — Update

**Status:** TODO — thêm theme state

```typescript
import { create } from "zustand";

interface AppState {
  selectedChannelId: string | null;
  setSelectedChannel: (id: string | null) => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedChannelId: null,
  setSelectedChannel: (id) => set({ selectedChannelId: id }),
  theme: (localStorage.getItem("theme") as "light" | "dark") || "dark",
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },
}));
```

---

### `packages/ui/src/App.tsx` — Update

**Status:** TODO — remove useWebSocket, add theme toggle

```typescript
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { useAppStore } from "./stores/useAppStore";
import { ChannelPanel } from "./components/ChannelPanel";
import { ChatPanel } from "./components/ChatPanel";
import { AgentPanel } from "./components/AgentPanel";
import { ThemeToggle } from "./components/ThemeToggle";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function Dashboard() {
  const { theme } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold font-mono tracking-tight">clawd</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[240px_1fr_320px] grid-rows-[1fr] overflow-hidden">
        <ChannelPanel />
        <ChatPanel />
        <div className="flex flex-col h-full border-l border-border overflow-hidden">
          <AgentPanel />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
```

---

### `packages/ui/src/components/ThemeToggle.tsx` — Update

**Status:** TODO — thêm cursor-pointer, dùng CSS vars

```typescript
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "../stores/useAppStore";

export function ThemeToggle() {
  const { theme, setTheme } = useAppStore();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="cursor-pointer"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
```

---

### `packages/ui/src/components/ChatPanel.tsx` — Add Typing Indicator

**Status:** TODO — thêm 3-dot bounce animation

Thêm component TypingIndicator:

```typescript
function TypingIndicator() {
  return (
    <div className="flex gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
```

Sử dụng trong ChatPanel khi `draftAssistant?.status === "streaming"`.

---

### `packages/ui/src/components/LogPanel.tsx` — Update

**Status:** TODO — cần check current implementation

Current implementation đang dùng cách nào để lấy logs? Nếu dùng SSE thì giữ nguyên, nếu dùng polling thì cần check.

---

### `packages/ui/src/components/AgentPanel.tsx` — Update

**Status:** TODO — thêm status pulse animation

Agent status indicator nên có pulse animation khi agent đang running.

---

## 5. Component List

| Component | Status | Notes |
|-----------|--------|-------|
| `App.tsx` | Update | Remove useWebSocket, add theme |
| `App.css` | Update | AI-Native CSS variables |
| `ChannelPanel.tsx` | Done | ✅ shadcn components |
| `ChatPanel.tsx` | Update | Add typing indicator |
| `AgentPanel.tsx` | Update | Add status pulse |
| `ThemeToggle.tsx` | Update | cursor-pointer, CSS vars |
| `LogPanel.tsx` | Check | Verify current implementation |
| `stores/useAppStore.ts` | Update | Add theme state |

---

## 6. TODO List (Priority Order)

### High Priority (UX Fixes)

1. [ ] **AgentPanel**: Fix hardcoded "Idle" status → show actual state
   - Add `status: "idle" | "running" | "error"` to Agent type
   - Show "Thinking..." with pulse animation when agent is processing
   - Use green for idle, yellow pulse for running, red for error

2. [ ] **ChatPanel**: Add 3-dot typing indicator during streaming
   - Create `TypingIndicator` component with bounce animation
   - Show when `draftAssistant.status === "streaming"`

3. [ ] **ChatPanel**: Add connection status indicator
   - Green pulse: Connected, ready
   - Yellow: Connecting/Sending
   - Red: Error/Disconnected
   - Show in ChatPanel header or composer area

4. [ ] **ChatPanel**: Improve failed message retry UX
   - Use shadcn Button with destructive variant (not native button)
   - Add prominent error styling
   - Consider auto-retry option

### Medium Priority (Visual Improvements)

5. [ ] **ChatPanel**: Add border-left accent for AI messages
   - AI messages get `border-l-2 border-l-primary` style
   - User messages remain clean

6. [ ] **ChatPanel**: Add Cmd/Ctrl+Enter keyboard shortcut
   - Send message on Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)

7. [ ] **AgentPanel**: Add status pulse animation
   - Pulse animation when agent status is "running"
   - Smooth transition between states

### Design System (from v1)

8. [ ] Update `App.css` với AI-Native design system
9. [ ] Update `useAppStore.ts` thêm theme state
10. [ ] Update `App.tsx` remove useWebSocket, add theme effect
11. [ ] Update `ThemeToggle.tsx` cursor-pointer
12. [ ] Check `LogPanel.tsx` current implementation
13. [ ] Add Inter + JetBrains Mono fonts vào `index.html`

---

## 7. UX Fixes — Implementation Details

### 7.1 Agent Status — AgentPanel.tsx

**Current Problem:** Status always shows "Idle" (hardcoded at line 109-111).

**Solution:** Pass `isRunning` prop or check `draftAssistant` state from parent.

```typescript
// In ChatPanel, expose running state via context or prop
// Or: Track which agents are currently processing in useAppStore

// AgentPanel renders:
<span className={cn(
  "w-1.5 h-1.5 rounded-full",
  isRunning ? "bg-yellow-500 animate-pulse" : "bg-emerald-500"
)} />
<span>{isRunning ? "Thinking" : "Idle"}</span>
```

### 7.2 Typing Indicator — ChatPanel.tsx

**Add component:**

```typescript
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
```

**Use in draftAssistant rendering:**

```tsx
// When streaming, show TypingIndicator instead of just "..."
{draftAssistant.status === "streaming" ? (
  <TypingIndicator />
) : (
  <MarkdownText text={draftAssistant.text || "(empty response)"} />
)}
```

### 7.3 Connection Status — ChatPanel.tsx

**Add state:**

```typescript
type ConnectionStatus = "connected" | "connecting" | "error";
const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connected");
```

**Show in ChatPanel header:**

```tsx
<div className="flex items-center gap-2 px-4 py-2 border-b border-border">
  <span className={cn(
    "w-2 h-2 rounded-full",
    connectionStatus === "connected" && "bg-emerald-500",
    connectionStatus === "connecting" && "bg-yellow-500 animate-pulse",
    connectionStatus === "error" && "bg-red-500"
  )} />
  <span className="text-xs text-muted-foreground capitalize">{connectionStatus}</span>
</div>
```

**Update status during streamMessage:**

```typescript
// At start of streamMessage
setConnectionStatus("connecting");

// On success/error/done
setConnectionStatus(res.ok ? "connected" : "error");
```

### 7.4 Retry Button — ChatPanel.tsx

**Current:** Native `<button>` with inline styling (lines 290-301).

**Fix:** Use shadcn Button with destructive variant:

```tsx
{draftAssistant.status === "failed" && (
  <Button
    variant="destructive"
    size="sm"
    onClick={() => retryFailedDraft()}
    disabled={isSending}
    className="mt-2"
  >
    <AlertCircle className="h-3.5 w-3.5" />
    Stream failed — Retry
    <RotateCcw className="h-3.5 w-3.5" />
  </Button>
)}
```

### 7.5 AI Message Border-Left Accent — ChatPanel.tsx

**Current:** Both user and AI messages use same style (lines 237-252).

**Fix:**

```tsx
<div
  className={cn(
    "px-3 py-2 rounded-xl text-sm leading-relaxed",
    isUser ? "rounded-tr-sm" : "rounded-tl-sm border-l-2 border-l-primary"
  )}
  style={
    isUser
      ? { backgroundColor: "hsl(var(--bubble-user))", color: "hsl(var(--bubble-user-foreground))" }
      : { backgroundColor: "hsl(var(--bubble-assistant))", color: "hsl(var(--bubble-assistant-foreground))" }
  }
>
```

### 7.6 Keyboard Shortcut — ChatPanel.tsx Composer

**Add onKeyDown handler to Input:**

```tsx
<Input
  value={inputValue}
  onChange={(e) => setInputValue(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void sendMessage();
    }
  }}
  placeholder="Type a message..."
  disabled={isSending}
  className="flex-1"
/>
```

### 7.7 Agent Status Pulse — AgentPanel.tsx

**Current:** Static green dot for all agents.

**Fix:** Accept `runningAgentIds` prop and show pulse:

```tsx
interface AgentCardProps {
  agent: Agent;
  isRunning: boolean;
  onRemove: (id: string) => void;
}

// In AgentCard:
<span className={cn(
  "w-1.5 h-1.5 rounded-full transition-colors",
  isRunning ? "bg-yellow-500 animate-pulse" : "bg-emerald-500"
)} />
<span>{isRunning ? "Thinking" : "Idle"}</span>
```

---

## 8. Acceptance Criteria

- [ ] Dark mode toggle works (300ms transition)
- [ ] All colors use CSS variables (no hardcoded hex)
- [ ] Typing indicator shows 3-dot bounce animation when streaming
- [ ] AI messages have border-left accent in primary color
- [ ] Code blocks use JetBrains Mono font
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] prefers-reduced-motion respected
- [ ] No emojis as icons (use Lucide)
- [ ] Agent status shows "Thinking" with pulse when processing
- [ ] Connection status indicator visible in ChatPanel
- [ ] Retry button uses shadcn destructive variant
- [ ] Cmd/Ctrl+Enter sends message

---

## 9. What is NOT in this milestone

- Artifact rendering (HTML/React/SVG/chart)
- Browser extension
- Message pagination
- Multi-workspace
- Agent file editor
- WebSocket (replaced by SSE)