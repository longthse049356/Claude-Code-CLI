# Clawd Rebuild — Design Spec

Rebuild [Clawd](https://github.com/Tuanm/clawd) from scratch across 10 incremental milestones to understand AI agent architecture.

**Original:** https://github.com/Tuanm/clawd | https://tuanm.github.io/clawd/

**Goal:** Understand architecture, mindset, and technologies behind AI agent platforms (Claude Code, Cursor, etc.)

**Approach:** Hybrid milestones — start simple, incrementally add features. Each milestone = 1 working system teaching 1 core concept.

**Target:** FE developer (JS/React/Next.js), limited BE experience, no prior AI agent experience.

---

## Architecture & Concepts

- [Mental Model & Core Architecture](./01-mental-model.md) — "Clawd is a chat room, agents are participants"
- [Tech Stack Decisions](./02-tech-stack.md) — Why Bun, SQLite, no framework, polling over events
- [Data Flows](./03-data-flows.md) — How a message travels through the system

## 10 Milestones

| # | File | Concept | You'll understand |
|---|---|---|---|
| M1 | [Terminal Chatbot](./milestones/M01-terminal-chatbot.md) | LLM API, streaming | How Claude Code calls the AI |
| M2 | [Chat Server](./milestones/M02-chat-server.md) | HTTP, WebSocket, SQLite | Backend of any chat app |
| M3 | [Agent Loop](./milestones/M03-agent-loop.md) | ReAct, polling | Core of Claude Code |
| M4 | [Tool System](./milestones/M04-tool-system.md) | Tool schema, execution | Why AI can "do things" |
| M5 | [Context Management](./milestones/M05-context-management.md) | Token counting, compression | Real limits of AI |
| M6 | [Memory System](./milestones/M06-memory-system.md) | FTS5, 3-tier memory | How AI "remembers" |
| M7 | [Multi-Agent](./milestones/M07-multi-agent.md) | Spawn, orchestration | AI collaboration |
| M8 | [MCP Protocol](./milestones/M08-mcp-protocol.md) | Server + client | Future of AI tooling |
| M9 | [Scheduling & Plugins](./milestones/M09-scheduling-plugins.md) | Cron, extensibility | Making it extensible |
| M10 | [Browser & UI](./milestones/M10-browser-ui.md) | Chrome ext, React UI | Full stack AI platform |

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
