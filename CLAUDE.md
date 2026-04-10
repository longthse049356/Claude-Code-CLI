# Clawd Rebuild Project

## What
Rebuilding the [Clawd](https://github.com/Tuanm/clawd) AI agent platform from scratch to deeply understand AI agent architecture, mindset, and technologies.

## Who
- User: FE developer (JavaScript, React, Next.js). Limited BE/Bun experience. No prior AI agent/LLM API experience.
- Goal: Understand architecture & mindset, not just copy code. Learn by building incrementally.

## Approach
- **Approach C (Hybrid milestones):** Start simple, incrementally add features. Each milestone = 1 working system teaching 1 core concept.
- Always map new BE concepts to FE analogies the user already knows.
- Reference Clawd's own docs at https://github.com/Tuanm/clawd/tree/main/docs for each milestone.

## Current State
- **Phase:** Design (brainstorming, not yet coding)
- **Design status:** Section 1 (Mental Model) and Section 2 (10 Milestones) approved. Section 3 (Tech Stack) in progress.

## 10 Milestones
- M1: Terminal chatbot (LLM API, streaming, tool_use format)
- M2: Chat server (HTTP, WebSocket, SQLite)
- M3: Agent loop (ReAct, polling, worker loop)
- M4: Tool system (tool schema, execution, sandbox)
- M5: Context management (token counting, scoring, compression)
- M6: Memory system (session, knowledge FTS5, long-term)
- M7: Multi-agent & Spaces (spawn, orchestration, isolation)
- M8: MCP Protocol (server + client, tool exposure)
- M9: Scheduling & plugins (cron, extensibility, skills)
- M10: Browser extension & React UI (Chrome MV3, artifacts)

## Tech Stack
- Runtime: Bun
- Language: TypeScript (strict)
- Database: SQLite (via bun:sqlite, WAL mode)
- UI: React + Vite
- No framework (raw Bun.serve())

## Key Decisions Made
1. Approach C chosen over "follow commits" (A) and "architecture layers" (B)
2. 10 milestones instead of 6 — each concept deserves dedicated focus
3. Docs structure: CLAUDE.md + docs/adr/ + docs/journal/ + docs/concepts/ + docs/clawd-notes/
4. Test cases defined per milestone (terminal/curl/wscat based until M10)

## Conventions
- ADR files in docs/adr/ for architecture decisions
- Learning journal in docs/journal/
- Concept explanations in docs/concepts/ (Vietnamese, own words)
- Clawd analysis notes in docs/clawd-notes/
