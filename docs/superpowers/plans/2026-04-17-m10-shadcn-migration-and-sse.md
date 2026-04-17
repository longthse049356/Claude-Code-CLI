# M10 UI Focus Plan: Shadcn Migration + SSE Chat Streaming

> Purpose: isolate follow-up work from the broad M10 Lite UI plan for easier tracking, smaller diffs, and lower token usage during implementation.

## Scope

### In scope
1. Migrate these 4 UI components to Shadcn primitives and token-consistent styling:
   - `packages/ui/src/components/ThemeToggle.tsx`
   - `packages/ui/src/components/ChannelPanel.tsx`
   - `packages/ui/src/components/AgentPanel.tsx`
   - `packages/ui/src/components/ChatPanel.tsx`
2. Stabilize dark/light mode behavior (single source of truth + first-paint correctness).
3. Add true assistant streaming UX in chat via SSE end-to-end.

### Out of scope
- New business features beyond chat/channel/agent current behavior.
- Large architecture rewrite of server/worker pipeline.
- Unrelated refactors in non-UI modules.

## Approaches Considered (Shadcn migration)

### Approach 1 — Big-bang rewrite
- Rewrite all 4 components in one pass.
- **Pros:** fastest to visual consistency.
- **Cons:** high regression risk, difficult review.

### Approach 2 — Incremental migration with parity gates (**Selected**)
- Migrate foundation first, then each component with acceptance checks.
- **Pros:** safer rollout, clear checkpoints, easy rollback.
- **Cons:** more steps.

### Approach 3 — Wrapper-first abstraction
- Build shared wrappers first, then migrate components.
- **Pros:** strong reuse.
- **Cons:** can over-abstract for current milestone.

## Execution Plan (Selected Approach 2)

## Phase A — UI Foundation & Theme Stability

- [ ] Confirm Shadcn primitives are present and canonical: `button`, `input`, `card`, `badge`, `scroll-area`, `separator`.
- [ ] Define one theme source of truth (store/hook) and remove component-local DOM theme toggles.
- [ ] Add first-paint theme init to prevent flash/mismatch.
- [ ] Acceptance:
  - [ ] Theme persists across reload.
  - [ ] No mismatch between header, panels, chat bubbles in both modes.

## Phase B — Migrate `ThemeToggle`

- [ ] Replace raw `<button>` with Shadcn `Button`.
- [ ] Keep current Sun/Moon animation behavior.
- [ ] Bind to centralized theme state.
- [ ] Acceptance:
  - [ ] Toggle is stable in light/dark.
  - [ ] ARIA label remains correct.

## Phase C — Migrate `ChannelPanel`

- [ ] Replace form controls with Shadcn `Input` + `Button`.
- [ ] Keep interaction parity (create/select channel).
- [ ] Replace inline color styles with semantic token classes where possible.
- [ ] Normalize loading and empty states.
- [ ] Acceptance:
  - [ ] Create channel works as before.
  - [ ] Active channel state is clear in both themes.

## Phase D — Migrate `AgentPanel`

- [ ] Replace add-agent form with Shadcn controls.
- [ ] Use `Card` + `Badge` for row/status presentation.
- [ ] Normalize delete action with Shadcn variants.
- [ ] Preserve typing/idle indicator behavior.
- [ ] Acceptance:
  - [ ] Add/remove agent behavior unchanged.
  - [ ] Typing/idle state remains accurate.

## Phase E — SSE End-to-End Streaming for Chat

### Backend
- [ ] Add SSE endpoint for chat streaming (channel-scoped).
- [ ] Persist user message immediately.
- [ ] Stream assistant deltas (`assistant_delta`) progressively.
- [ ] Persist final assistant message at stream completion.
- [ ] Emit terminal events (`assistant_done`, `error`) reliably.

### Frontend (`ChatPanel` + hook/store)
- [ ] Replace composer controls with Shadcn primitives.
- [ ] Add SSE client flow for send-message streaming.
- [ ] Render assistant draft bubble incrementally from deltas.
- [ ] Finalize draft bubble cleanly when done.
- [ ] Preserve existing typing indicator behavior unless explicitly superseded.

### Acceptance
- [ ] User sends message and sees assistant text appear progressively (not only final chunk).
- [ ] Stream interruption shows controlled error state (no UI break).
- [ ] No duplicate final assistant messages after reconciliation.

## Phase F — Verification Gates

- [ ] Functional parity checks for all 4 migrated components.
- [ ] Dark/light visual QA (contrast, borders, focus states, bubble readability).
- [ ] SSE UX QA: progressive rendering, end-state integrity, channel switch behavior.
- [ ] Type/build checks pass.

## QA Checklist (pass/fail)

### Theme
- [ ] Reload in dark mode preserves dark mode.
- [ ] Reload in light mode preserves light mode.
- [ ] No first-paint flash mismatch.

### ChannelPanel
- [ ] Create channel works.
- [ ] Selected state updates instantly.
- [ ] Empty/loading states render correctly.

### AgentPanel
- [ ] Add agent works.
- [ ] Remove agent works.
- [ ] Thinking/idle indicators update correctly.

### ChatPanel + SSE
- [ ] User message appears immediately.
- [ ] Assistant response streams token-by-token.
- [ ] Final assistant message is persisted and stable after refresh.
- [ ] No duplicate assistant bubbles.

## Notes
- This plan is an execution slice of M10 and complements `2026-04-14-m10-lite-ui.md`.
- Keep behavior parity unless explicitly changed by acceptance criteria above.
