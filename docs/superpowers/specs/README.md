# Clawd Rebuild — Design Spec

Rebuild [Clawd](https://github.com/Tuanm/clawd) from scratch across 10 incremental milestones to understand AI agent architecture.

**Original:** https://github.com/Tuanm/clawd | https://tuanm.github.io/clawd/

**Goal:** Understand architecture, mindset, and technologies behind AI agent platforms (Claude Code, Cursor, etc.)

**Approach:** Hybrid milestones — start simple, incrementally add features. Each milestone = 1 working system teaching 1 core concept.

**Target:** FE developer (JS/React/Next.js), limited BE experience, no prior AI agent experience.

---

## Workflow Per Milestone

Trước khi code bất kỳ milestone nào, phải đi đúng thứ tự:

```
M0X-xxx.md        ← 1. Đọc design (high-level, scope, concepts)
M0X-xxx.spec.md   ← 2. Viết spec (chi tiết: types, edge cases, acceptance criteria)
                  ← 3. User approve spec
                  ← 4. Viết implementation plan (writing-plans skill)
                  ← 5. Code
                  ← 6. Verify acceptance criteria
```

| File | Mục đích |
|---|---|
| `M0X-xxx.md` | "What & Why" — scope, concepts, FE analogies |
| `M0X-xxx.spec.md` | "Exactly how" — interfaces, function signatures, edge cases, checklist |

---

## Architecture & Concepts

- [Mental Model & Core Architecture](./01-mental-model.md) — "Clawd is a chat room, agents are participants"
- [Tech Stack Decisions](./02-tech-stack.md) — Why Bun, SQLite, no framework, polling over events
- [Data Flows](./03-data-flows.md) — How a message travels through the system

## 10 Milestones

| # | Design | Spec | Concept | Status |
|---|---|---|---|---|
| M1 | [Terminal Chatbot](./milestones/M01-terminal-chatbot.md) | [spec](./milestones/M01-terminal-chatbot.spec.md) | LLM API, streaming | Spec done ✓ |
| M2 | [Chat Server](./milestones/M02-chat-server.md) | — | HTTP, WebSocket, SQLite | Pending |
| M3 | [Agent Loop](./milestones/M03-agent-loop.md) | — | ReAct, polling | Pending |
| M4 | [Tool System](./milestones/M04-tool-system.md) | — | Tool schema, execution | Pending |
| M5 | [Context Management](./milestones/M05-context-management.md) | — | Token counting, compression | Pending |
| M6 | [Memory System](./milestones/M06-memory-system.md) | — | FTS5, 3-tier memory | Pending |
| M7 | [Multi-Agent](./milestones/M07-multi-agent.md) | — | Spawn, orchestration | Pending |
| M8 | [MCP Protocol](./milestones/M08-mcp-protocol.md) | — | Server + client | Pending |
| M9 | [Scheduling & Plugins](./milestones/M09-scheduling-plugins.md) | — | Cron, extensibility | Pending |
| M10 | [Browser & UI](./milestones/M10-browser-ui.md) | — | Chrome ext, React UI | Pending |

## Reference: Clawd Documentation

| File | Use at milestone |
|---|---|
| architecture.md (98KB) | M2-M10, primary reference |
| codebase-summary.md (52KB) | Start of each milestone |
| code-standards.md (34KB) | Throughout |
| agents.md (12KB) | M3, M7 |
| memory.md (15KB) | M6 |
| mcp-tools.md (16KB) | M8 |
| custom-tools.md (7KB) | M4, M9 |
| skills.md (9KB) | M9 |
| ui-design-system.md (42KB) | M10 |
| artifacts.md (4KB) | M10 |
| project-overview-pdr.md (22KB) | Before M1 |

## Success Criteria

1. Working AI agent platform with multi-agent chat, tool execution, memory, and scheduling
2. Can explain every architectural decision with "why" not just "what"
3. Understands how Claude Code, Cursor, and similar tools work internally
4. Comfortable with Bun, SQLite, WebSocket server-side — full-stack capability
