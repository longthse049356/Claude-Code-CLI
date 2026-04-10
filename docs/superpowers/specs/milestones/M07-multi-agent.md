# M7: Multi-Agent & Spaces

**Concept:** Multi-agent orchestration, sub-agent spawning, isolation

## What you'll build

```
src/
├── agent/
│   ├── worker-manager.ts  — Manage multiple workers per channel
│   └── worker-loop.ts     — Skip turn if another agent is replying
├── spaces/
│   ├── space-manager.ts   — Create/destroy spaces
│   └── space.ts           — Isolated channel + worker for sub-task
├── tools/handlers/
│   └── spawn-agent.ts     — Tool for agent to spawn sub-agent
└── ...
```

## Scope

- Multiple agents per channel, each polling independently
- Collision avoidance: if agent A is replying, agent B waits
- `spawn_agent` tool: creates isolated channel + worker for sub-task
- Space timeout: 300s default, kill if exceeded
- Max 9 spaces per channel
- Space result: report back to parent channel when done
- Recovery: restart server → resume running spaces

## Test cases

1. Add 2 agents to 1 channel → both reply (sequentially, no overlap)
2. Agent A calls `spawn_agent("research X")` → sub-channel created
3. Sub-agent completes → result posted to parent channel
4. Sub-agent exceeds 300s → killed, parent receives timeout error
5. Restart server mid-space → space resumes

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **Multi-agent** | Multiple AIs chatting, self-coordinating | Like multiple `useReducer` dispatching to one store |
| **Space/Sub-agent** | Child agent running isolated task, reporting result back | Like Web Worker — runs in background, postMessage result |
| **Collision avoidance** | Prevent 2 agents replying at the same time | Like mutex/lock — only 1 writer at a time |
| **Orchestration** | Coordinate multiple agents: who does what, in what order | Like Promise.all — parallel tasks, collect results |

## Clawd docs to read

- `agents.md` — Sub-agent spawning section
- `architecture.md` — Space System section

## After this milestone

You understand AI collaboration — how multiple agents coordinate without stepping on each other's toes.
