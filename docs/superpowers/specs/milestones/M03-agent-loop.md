# M3: Agent Loop

**Concept:** ReAct pattern, polling, worker loop

## What you'll build

```
src/
├── agent/
│   ├── worker-loop.ts    — Polling: check messages → call LLM → post reply
│   ├── worker-manager.ts — Manage multiple worker loops
│   └── system-prompt.ts  — Build system prompt for agent
├── server/
│   ├── router.ts         — Add route: POST /channels/:id/agents
│   └── ...
└── ...
```

## Scope

- Agent config: `{name, model, system_prompt}`
- Adding agent to channel → starts worker loop
- Worker loop every 200ms: check for new messages → call LLM → save response → broadcast
- Agent replies by INSERT into messages table (same as human, but `role: "assistant"`)
- "Typing indicator" via WebSocket event while agent is processing
- Stop loop when agent removed or server shutdown

## Test cases

1. `POST /channels/:id/agents body={"name":"claude"}` → agent starts
2. POST message "Hello" → seconds later, agent auto-replies
3. wscat receives typing event, then message event
4. POST 3 messages rapidly → agent replies sequentially (queue, no skip)
5. `DELETE /channels/:id/agents/:name` → agent stops polling
6. Restart server → agent auto-resumes

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **Worker loop** | `setInterval` checking for new messages every 200ms | Like polling API in useEffect |
| **ReAct loop** | Observe (read chat) → Reason (call LLM) → Act (reply) | Like event loop: listen → process → update |
| **System prompt** | Instructions for AI agent, injected at start of every LLM call | Like defaultProps — default configuration |
| **Polling vs Event-driven** | Clawd chose polling because agent needs a *control loop*, not reactivity | Like `setInterval` vs `addEventListener` — each has its use case |
| **Heartbeat** | Detect stuck agent (30s no response) | Like health check ping in microservices |

## Clawd docs to read

- `agents.md` — agent file format, built-in agents
- `architecture.md` — Worker System section

## After this milestone

You've built the equivalent of Claude Code's core. An AI agent that automatically reads context, thinks, and replies. Everything else is adding capabilities.
