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
- **Phase:** M3 complete ✅ — ready for M4
- **Current milestone:** M4 (Tool System) — chưa bắt đầu
- **Design docs:** `docs/superpowers/specs/` (README + 3 concept files + 10 milestone files)
- **Last tag:** `M3-done`

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

## Rules — KHÔNG được vi phạm

1. **KHÔNG tự ý commit** — Phải hỏi user trước khi chạy `git commit`
2. **KHÔNG tự ý xóa file** — Phải hỏi user trước khi chạy `rm` hoặc `git rm`
3. **KHÔNG bắt đầu code** khi chưa có `.spec.md` được approve

Read-only operations (git status, diff, log, add) không cần hỏi.



**Bắt buộc theo thứ tự này cho mỗi milestone:**

```
1. Read design file     docs/superpowers/specs/milestones/M0X-xxx.md
2. Write spec file      docs/superpowers/specs/milestones/M0X-xxx.spec.md
3. User reviews spec    → approval required before coding
4. Write impl plan      invoke writing-plans skill
5. Implement            code theo spec
6. Verify               check all acceptance criteria in spec file
7. Update CLAUDE.md     cập nhật Current State sang milestone tiếp theo
```

**Không được bắt đầu code khi chưa có `.spec.md` được approve.**

## Spec Format (M0X-xxx.spec.md)

Mỗi spec file phải có đủ các sections:
1. Project Setup (deps, env, tsconfig, run command)
2. Data Structures (TypeScript interfaces chính xác)
3. File Specifications (responsibility + function signatures per file)
4. Feature-specific details (tools, prompts, schemas...)
5. Edge Cases & Error Handling (table format)
6. Acceptance Criteria (checklist, verify được)
7. File Structure (final, với line count estimate)
8. What is NOT in this milestone

## Key References
- `docs/workflow.md` — Khi nào commit, khi nào dùng worktree/subagent/agent team, tips per milestone

## Skills
- `docs/superpowers/skills/bun-backend-patterns/SKILL.md` — Backend patterns cho Bun stack: REST routing, SQLite repository, WebSocket, error handling, caching, auth, rate limiting, background jobs, logging

## Conventions
- ADR files in `docs/adr/` for architecture decisions
- Learning journal in `docs/journal/`
- Concept explanations in `docs/concepts/` (Vietnamese, own words)
- Clawd analysis notes in `docs/clawd-notes/`
- Spec files: `docs/superpowers/specs/milestones/M0X-xxx.spec.md` (1 per milestone, viết trước khi code)
- Design files: `docs/superpowers/specs/milestones/M0X-xxx.md` (high-level overview, đã viết sẵn)
