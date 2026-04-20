# M10 Assistant-only SSE Design

## Context
- Current UI/server realtime path is WebSocket-based.
- In this phase, app scope is personal single-user chat: user sends message, AI agent replies.
- Requirement: remove WebSocket and stream only assistant response via SSE.

## Goals
1. Remove WebSocket client/server flow for this phase.
2. Stream assistant response token-by-token to UI with SSE.
3. Persist assistant message only once stream completes successfully.
4. On stream failure, keep partial text in UI (failed state) and do not persist assistant partial in DB.

## Non-goals
- Multi-client realtime broadcast.
- Presence/online status.
- Cross-tab synchronization.
- Persisting partial assistant chunks.

## Proposed API

### Endpoint
`POST /channels/:id/messages/stream`

### Request body
```json
{ "text": "user message" }
```

### Response
- Success path: `text/event-stream`
- Validation/not found path: normal JSON error response (4xx)

### SSE headers
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

### SSE event contract
1. `event: token`
```json
{ "text": "..." }
```
2. `event: done`
```json
{ "message": { "id": "...", "channel_id": "...", "text": "...", "role": "assistant", "agent_name": "...", "created_at": 0 } }
```
3. `event: error`
```json
{ "error": "..." }
```

## End-to-end Flow
1. UI submits form to `POST /channels/:id/messages/stream`.
2. Server validates body/channel.
3. Server persists user message immediately.
4. Server starts Anthropic streaming call.
5. For each text delta/token, server emits `token` SSE event.
6. On successful completion:
   - Server concatenates final assistant text.
   - Server persists exactly one assistant `DbMessage`.
   - Server emits `done` with persisted assistant message.
   - Server closes stream.
7. On error mid-stream:
   - Server emits `error`.
   - Server closes stream.
   - Assistant partial is not persisted.

## UI Behavior

### ChatPanel
- Keep submit-based chat UX.
- On submit:
  - Create optimistic user bubble immediately.
  - Create assistant draft bubble (empty text, `streaming` state).
- On `token`:
  - Append token text to assistant draft bubble.
- On `done`:
  - Replace draft bubble with final persisted assistant message from payload.
- On `error`:
  - Keep partial draft content visible.
  - Mark draft as `failed`.
  - Show Retry action.

### ChannelPanel
- No streaming logic changes.

## Data & Persistence Rules
- User message: persisted before assistant streaming.
- Assistant message: persisted only after successful stream completion.
- No partial assistant persistence in this phase.

## Error Handling
- Invalid JSON / empty text / unknown channel: return regular JSON error (400/404).
- Upstream LLM stream failure: emit `event:error`, close stream.
- Client disconnects: abort upstream stream via `AbortSignal`.

## Migration Notes (WS removal)
- Remove `/ws` upgrade handling from server bootstrap.
- Remove websocket handler module and broadcast-based realtime path.
- Remove `useWebSocket` hook + `useWsStore` realtime message state.
- `useMessages` becomes API-driven plus local draft-stream state in chat component (or dedicated stream hook/store).

## Trade-offs
- Pros:
  - Simpler architecture for single-user phase.
  - Better learning focus on LLM response streaming.
  - Better UX from token-level progressive rendering.
- Cons:
  - Loses generic realtime broadcast capability until reintroduced.
  - Future multi-client features will require a new realtime layer.

## Acceptance Criteria
- [x] No WebSocket connection is opened by UI.
- [x] Server exposes `POST /channels/:id/messages/stream` with SSE events `token|done|error`.
- [x] Assistant response appears progressively token-by-token.
- [x] On success, exactly one assistant message is saved to DB.
- [x] On stream failure, assistant partial is not saved to DB.
- [x] UI displays partial failed response and allows retry.
- [x] Existing channel selection/create flows continue working.

## Verification Plan
1. Send a normal message and verify progressive token rendering.
2. Confirm `done` finalizes one assistant DB row.
3. Force upstream error and confirm:
   - UI shows partial + failed state.
   - No partial assistant row in DB.
4. Refresh app and verify only persisted complete messages appear.

## Open Questions (resolved)
- Keep WS alongside SSE? → No, remove WS for this phase.
- Stream granularity? → Token-by-token.
- Persist timing? → Persist assistant only at successful stream completion.
- Failure behavior? → Keep partial in UI only; no DB partial persistence.
