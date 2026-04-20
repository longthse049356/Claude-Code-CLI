# M10 Browser UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement AI-Native UI redesign with dark mode, typing indicator, connection status, and UX improvements for the Clawd chat interface.

**Architecture:** Update CSS variables for AI-Native design system (purple/cyan palette), add state management for theme and connection status, enhance ChatPanel and AgentPanel with animations and status indicators, and integrate Inter + JetBrains Mono fonts.

**Tech Stack:** React, Tailwind CSS (shadcn/ui), Zustand, TanStack Query, Lucide icons

---

## File Structure

### Files to Modify

| File | Responsibility |
|------|----------------|
| `packages/ui/src/App.css` | AI-Native CSS variables for light/dark mode |
| `packages/ui/src/stores/useAppStore.ts` | Theme state management |
| `packages/ui/src/components/ThemeToggle.tsx` | Theme toggle using CSS vars |
| `packages/ui/src/components/ChatPanel.tsx` | Typing indicator, connection status, AI border, retry button, keyboard shortcut |
| `packages/ui/src/components/AgentPanel.tsx` | Status pulse animation |
| `packages/ui/index.html` | Add Inter + JetBrains Mono fonts |

### Files to Create

| File | Responsibility |
|------|----------------|
| `packages/ui/src/components/connection-status.tsx` | Connection status indicator component |

---

## Task 1: Update useAppStore with Theme State

**Files:**
- Modify: `packages/ui/src/stores/useAppStore.ts`

**Add theme state to store:**

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

## Task 2: Update App.css with AI-Native Design System

**Files:**
- Modify: `packages/ui/src/App.css`

**Replace existing CSS variables with AI-Native palette:**

```css
:root {
  --primary: 262 80% 58%;
  --primary-foreground: 0 0% 100%;
  --secondary: 262 70% 70%;
  --secondary-foreground: 0 0% 100%;
  --accent: 187 90% 47%;
  --accent-foreground: 0 0% 100%;
  --background: 270 60% 98%;
  --foreground: 250 50% 8%;
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

.dark {
  --primary: 215 28% 17%;
  --primary-foreground: 210 40% 98%;
  --secondary: 215 25% 22%;
  --secondary-foreground: 210 40% 98%;
  --accent: 142 71% 45%;
  --accent-foreground: 0 0% 0%;
  --background: 222 47% 6%;
  --foreground: 210 40% 98%;
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
  --radius: 0.5rem;
}
```

---

## Task 3: Update ThemeToggle to Use shadcn Button + CSS Vars

**Files:**
- Modify: `packages/ui/src/components/ThemeToggle.tsx`

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

## Task 4: Create TypingIndicator Component

**Files:**
- Create: `packages/ui/src/components/typing-indicator.tsx`

```typescript
export function TypingIndicator() {
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

---

## Task 5: Create ConnectionStatus Component

**Files:**
- Create: `packages/ui/src/components/connection-status.tsx`

```typescript
import { cn } from "../lib/utils";

type ConnectionStatus = "connected" | "connecting" | "error";

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
}

export function ConnectionStatusIndicator({ status }: ConnectionStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          status === "connected" && "bg-emerald-500",
          status === "connecting" && "bg-yellow-500 animate-pulse",
          status === "error" && "bg-red-500"
        )}
      />
      <span className="text-xs text-muted-foreground capitalize">{status}</span>
    </div>
  );
}

export type { ConnectionStatus };
```

---

## Task 6: Update ChatPanel — Add Typing Indicator + Connection Status + AI Border + Retry Button + Keyboard Shortcut

**Files:**
- Modify: `packages/ui/src/components/ChatPanel.tsx`

**Changes:**

1. **Add imports:**
```typescript
import { TypingIndicator } from "./typing-indicator";
import { ConnectionStatusIndicator } from "./connection-status";
import type { ConnectionStatus } from "./connection-status";
```

2. **Add state:**
```typescript
const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connected");
```

3. **Update streamMessage to track connection status:**
```typescript
// At start of streamMessage
setConnectionStatus("connecting");

// On success/error/done
setConnectionStatus(res.ok ? "connected" : "error");
```

4. **Add connection status to header:**
```tsx
<div className="flex items-center justify-between px-4 py-2 border-b border-border">
  <span className="text-xs font-medium text-muted-foreground">Messages</span>
  <ConnectionStatusIndicator status={connectionStatus} />
</div>
```

5. **Add TypingIndicator when streaming:**
```tsx
{draftAssistant.status === "streaming" ? (
  <TypingIndicator />
) : (
  <MarkdownText text={draftAssistant.text || "(empty response)"} />
)}
```

6. **Add border-left accent for AI messages:**
```tsx
<div
  className={cn(
    "px-3 py-2 rounded-xl text-sm leading-relaxed",
    isUser ? "rounded-tr-sm" : "rounded-tl-sm border-l-2 border-l-primary"
  )}
  style={...}
>
```

7. **Replace native button with shadcn Button for retry:**
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

8. **Add Cmd/Ctrl+Enter keyboard shortcut:**
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

---

## Task 7: Update AgentPanel — Status Pulse Animation

**Files:**
- Modify: `packages/ui/src/components/AgentPanel.tsx`

**Changes:**

1. **Update interface to include isRunning prop:**
```typescript
interface AgentCardProps {
  agent: Agent;
  isRunning: boolean;
  onRemove: (id: string) => void;
}
```

2. **Update status indicator to show pulse when running:**
```tsx
<span
  className={cn(
    "w-1.5 h-1.5 rounded-full transition-colors",
    isRunning ? "bg-yellow-500 animate-pulse" : "bg-emerald-500"
  )}
/>
<span>{isRunning ? "Thinking" : "Idle"}</span>
```

3. **Accept runningAgentIds prop from parent or context:**
- Option A: Accept `runningAgentIds: string[]` prop
- Option B: Use a context to share running state

For simplicity, accept `runningAgentIds` prop:

```typescript
interface AgentPanelProps {
  runningAgentIds?: string[];
}

export function AgentPanel({ runningAgentIds = [] }: AgentPanelProps) {
  // ...
  const isRunning = runningAgentIds.includes(agent.id);
  // ...
}
```

4. **Update Card to use pulse status:**
```tsx
<Card key={agent.id} className="p-3">
  <div className="flex items-start justify-between">
    <div className="flex items-center gap-2">
      <Bot className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{agent.name}</span>
    </div>
    <Button
      variant="ghost"
      size="icon"
      onClick={() => handleRemoveAgent(agent.id)}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
    {agent.model && (
      <span className="flex items-center gap-1">
        <Cpu className="h-3 w-3" />
        {formatModelName(agent.model)}
      </span>
    )}
    <span className="flex items-center gap-1">
      <span className={cn(
        "w-1.5 h-1.5 rounded-full transition-colors",
        runningAgentIds.includes(agent.id) ? "bg-yellow-500 animate-pulse" : "bg-emerald-500"
      )} />
      {runningAgentIds.includes(agent.id) ? "Thinking" : "Idle"}
    </span>
  </div>
</Card>
```

---

## Task 8: Add Fonts to index.html

**Files:**
- Modify: `packages/ui/index.html`

**Add Google Fonts link in head:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

**Update body font in App.css:**
```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code, pre, .font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}
```

---

## Task 9: Add prefers-reduced-motion Support

**Files:**
- Modify: `packages/ui/src/App.css`

**Add reduced motion media query:**
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Task 10: Verify All Acceptance Criteria

Run the app and verify:

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

## What is NOT in This Plan

- Artifact rendering (HTML/React/SVG/chart)
- Browser extension
- Message pagination
- Multi-workspace
- Agent file editor
- WebSocket (replaced by SSE)

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-m10-shadcn-migration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
