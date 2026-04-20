# M10 Shadcn Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay tất cả native HTML elements (input, button, form) trong UI package sang dùng shadcn/ui components.

**Architecture:** Shadcn init trong `packages/ui/`, add 6 components (button, input, card, badge, scroll-area, separator), sau đó update từng panel component để sử dụng shadcn thay vì native elements.

**Tech Stack:** shadcn/ui, React, TypeScript

---

## Task 1: Initialize Shadcn

**Files:**
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/lib/utils.ts` (utility for cn)
- Modify: `packages/ui/src/App.css`
- Modify: `packages/ui/tailwind.config.ts`

- [ ] **Step 1: Check existing utils.ts**

Run: `cat packages/ui/src/lib/utils.ts`
Expected: Check if `cn` function already exists

- [ ] **Step 2: Navigate to ui package**

Run: `cd packages/ui`

- [ ] **Step 3: Init shadcn**

Run: `bunx shadcn@latest init --yes --defaults`
Expected: Creates `components.json` and prompts for defaults

**If interactive, use these answers:**
- Style: New York
- Base color: Neutral
- CSS file: App.css (existing)
- CSS variables: Yes
- prefix: (leave empty)
- tailwind config: tailwind.config.ts (existing)
- components: @/components
- utils: @/lib/utils
- inline: No

- [ ] **Step 4: Verify components.json created**

Run: `cat packages/ui/components.json`

- [ ] **Step 5: Add required shadcn components**

Run: `cd packages/ui && bunx shadcn@latest add button input card badge scroll-area separator --yes`
Expected: Creates `src/components/ui/` with all components

- [ ] **Step 6: Verify ui components created**

Run: `ls -la packages/ui/src/components/ui/`
Expected: Shows button.tsx, input.tsx, card.tsx, badge.tsx, scroll-area.tsx, separator.tsx

- [ ] **Step 7: Commit**

```bash
git add packages/ui/components.json packages/ui/src/components/ui/ packages/ui/src/lib/utils.ts packages/ui/tailwind.config.ts
git commit -m "feat(ui): init shadcn with button, input, card, badge, scroll-area, separator"
```

---

## Task 2: Update ChannelPanel

**Files:**
- Modify: `packages/ui/src/components/ChannelPanel.tsx:30-49` (input + button)
- Modify: `packages/ui/src/components/ChannelPanel.tsx:61-82` (channel list buttons)

- [ ] **Step 1: Read current ChannelPanel**

Run: `cat packages/ui/src/components/ChannelPanel.tsx`

- [ ] **Step 2: Add shadcn imports**

Add at top of file:
```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

- [ ] **Step 3: Replace create form input (lines 31-37)**

Replace native input:
```tsx
<input
  type="text"
  value={newChannelName}
  onChange={(e) => setNewChannelName(e.target.value)}
  placeholder="New channel..."
  className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
/>
```

With shadcn Input:
```tsx
<Input
  value={newChannelName}
  onChange={(e) => setNewChannelName(e.target.value)}
  placeholder="New channel..."
  className="flex-1"
/>
```

- [ ] **Step 4: Replace create form button (lines 38-49)**

Replace native button:
```tsx
<button
  type="submit"
  disabled={createChannel.isPending || !newChannelName.trim()}
  className="p-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
>
  {createChannel.isPending ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Plus className="h-4 w-4" />
  )}
</button>
```

With shadcn Button:
```tsx
<Button
  type="submit"
  size="icon"
  disabled={createChannel.isPending || !newChannelName.trim()}
>
  {createChannel.isPending ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Plus className="h-4 w-4" />
  )}
</Button>
```

- [ ] **Step 5: Replace channel list button (lines 61-82)**

Replace native button with shadcn Button:
```tsx
<Button
  key={channel.id}
  variant="ghost"
  className={cn(
    "w-full justify-start gap-2 text-left",
    isActive
      ? "border-l-2 border-l-[hsl(var(--sidebar-active-foreground))] font-medium"
      : "border-l-2 border-l-transparent"
  )}
  style={
    isActive
      ? {
          backgroundColor: "hsl(var(--sidebar-active))",
          color: "hsl(var(--sidebar-active-foreground))",
        }
      : { color: "hsl(var(--sidebar-foreground))" }
  }
  onClick={() => setSelectedChannel(channel.id)}
>
  <Hash className="h-4 w-4 flex-shrink-0 opacity-60" />
  <span className="truncate">{channel.name}</span>
</Button>
```

- [ ] **Step 6: Verify build**

Run: `cd packages/ui && bun run build 2>&1 | head -30`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/ChannelPanel.tsx
git commit -m "refactor(ui): use shadcn Button and Input in ChannelPanel"
```

---

## Task 3: Update AgentPanel

**Files:**
- Modify: `packages/ui/src/components/AgentPanel.tsx:55-75` (input + button)
- Modify: `packages/ui/src/components/AgentPanel.tsx:83-115` (agent cards)

- [ ] **Step 1: Read current AgentPanel**

Run: `cat packages/ui/src/components/AgentPanel.tsx`

- [ ] **Step 2: Add shadcn imports**

Add at top of file:
```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
```

- [ ] **Step 3: Replace add agent form (lines 55-75)**

Replace input with shadcn Input, button with shadcn Button:
```tsx
<form onSubmit={handleAddAgent} className="flex gap-1.5">
  <Input
    value={newAgentName}
    onChange={(e) => setNewAgentName(e.target.value)}
    placeholder="Agent name..."
    className="flex-1"
  />
  <Button
    type="submit"
    size="icon"
    disabled={addAgent.isPending || !newAgentName.trim()}
  >
    {addAgent.isPending ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Plus className="h-4 w-4" />
    )}
  </Button>
</form>
```

- [ ] **Step 4: Replace agent card (lines 83-115)**

Wrap with shadcn Card and use Button for delete:
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
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Idle
    </span>
  </div>
</Card>
```

- [ ] **Step 5: Verify build**

Run: `cd packages/ui && bun run build 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/AgentPanel.tsx
git commit -m "refactor(ui): use shadcn Button, Input, Card in AgentPanel"
```

---

## Task 4: Update ChatPanel

**Files:**
- Modify: `packages/ui/src/components/ChatPanel.tsx:308-333` (composer form)

- [ ] **Step 1: Read current ChatPanel**

Run: `cat packages/ui/src/components/ChatPanel.tsx`

- [ ] **Step 2: Add shadcn imports**

Add at top of file:
```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

- [ ] **Step 3: Replace composer form (lines 308-333)**

Replace input with shadcn Input, button with shadcn Button:
```tsx
<form onSubmit={(e) => {
  e.preventDefault();
  void sendMessage();
}} className="p-4 border-t border-border bg-card">
  <div className="flex gap-2">
    <Input
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      placeholder="Type a message..."
      disabled={isSending}
      className="flex-1"
    />
    <Button
      type="submit"
      disabled={!inputValue.trim() || isSending}
      size="icon"
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <SendHorizontal className="h-4 w-4" />
      )}
    </Button>
  </div>
</form>
```

- [ ] **Step 4: Verify build**

Run: `cd packages/ui && bun run build 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ChatPanel.tsx
git commit -m "refactor(ui): use shadcn Button and Input in ChatPanel"
```

---

## Verification Checklist

- [ ] `bun run dev` → UI renders without errors
- [ ] ChannelPanel: can create channel
- [ ] AgentPanel: can add/remove agent
- [ ] ChatPanel: can send message
- [ ] No console errors in browser

---

## Plan Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Init shadcn + add components | `components.json`, `src/lib/utils.ts`, `src/components/ui/*` |
| 2 | Update ChannelPanel | `src/components/ChannelPanel.tsx` |
| 3 | Update AgentPanel | `src/components/AgentPanel.tsx` |
| 4 | Update ChatPanel | `src/components/ChatPanel.tsx` |

**Total: 4 tasks, ~20-30 minutes**

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-m10-shadcn-migration.md`**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?