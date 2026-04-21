# ADR 0001 — Poll-DB architecture for SSE endpoint

**Status:** Accepted (từ M2) · Extended ở M3.5 (thêm token store song song) · Sẽ revisit ở M7
**Date:** 2026-04-21 (ghi lại retroactively sau brainstorm M3.5)
**Scope:** `src/server/router.ts` (POST `/channels/:id/messages/stream`) + `src/agent/worker-loop.ts`

---

## Context

M2 cần endpoint HTTP trả về assistant reply cho client. M3 thêm worker loop chạy **độc lập** với HTTP handler (tick mỗi 1s, phát hiện user message mới, gọi LLM, save DB).

Vấn đề: HTTP handler và worker loop là 2 quá trình độc lập. Làm sao HTTP handler "biết" khi worker đã save xong reply để trả cho client?

Có 2 hướng kinh điển:

### Option A — Poll-DB (đã chọn)
Router mở SSE stream, trong `ReadableStream.start()` loop mỗi 500ms:
- Query `getMessagesAfter(channelId, cursor)`
- Nếu thấy assistant row mới → emit `event: done` + close.
- Timeout 120s.

### Option B — Push via EventEmitter
Worker `emit("reply", { channelId, message })`. Router subscribe và push thẳng vào SSE controller. Không cần poll, latency ~0ms.

## Decision

Chọn **Option A (poll-DB)**.

## Rationale

1. **Đơn giản đúng mức với scope M2/M3.** Không cần coordinate state giữa worker và HTTP handler qua pub/sub → ít chỗ fail.
2. **DB là source of truth.** Nếu client disconnect giữa stream, reply vẫn trong DB, client F5 load lại được. Push-based phải handle disconnect + replay logic.
3. **Debug dễ.** Mọi thứ đi qua SQLite → mở `chat.db` bằng `sqlite3` là thấy. Push-based cần log EventEmitter.
4. **Không tối ưu sớm.** M2 chưa biết có cần multi-agent broadcast hay không. Chốt pub/sub sớm = over-engineer.

## Consequences

### ✅ Positive
- Worker loop không cần biết gì về HTTP layer (separation of concerns).
- SSE endpoint stateless — restart server giữa turn, client retry, vẫn OK.
- Test được bằng mock clock + in-memory DB, không cần mock EventEmitter.

### ❌ Negative — discovered ở M3.5
- **Không stream được LLM tokens theo kiểu naive.** `sendMessage` gọi Anthropic SDK stream nhưng `finalMessage()` block tới khi xong → router chỉ thấy đầy đủ reply 1 phát khi save DB → UX "đợi mù".
- **Fix M3.5 (Option A+):** Thêm in-memory `tokenStore: Map<channelId, string>` **song song** với DB. Worker append tokens vào store qua callback. Router poll **cả DB lẫn store** trong cùng loop 500ms. Giữ được poll-DB architecture, thêm streaming mà không cần pub/sub.
  - Trade-off: ~250ms average latency giữa token emit và UI nhận (do polling). Không nhận ra bằng mắt thường.
  - Ref: `docs/superpowers/specs/milestones/M3.5-streaming-tokens.spec.md`

### ⚠️ Open — sẽ revisit ở M7
Khi M7 (Multi-agent & Spaces) support 2+ agent cùng 1 channel cùng streaming:
- `tokenStore: Map<channelId, string>` sẽ phải thành `Map<channelId, Map<agentId, string>>`.
- Hoặc lúc đó migrate sang pub/sub (Option B) là đúng thời điểm — khi **đã có nhu cầu thật**, không phải đoán.

## Alternatives considered but rejected

### WebSocket per channel
Đã thử và loại ở commit `4ef5b49`. Lý do: complexity cao hơn SSE đáng kể, không có upstream needs (client không gửi gì giữa turn).

### Long polling
Dư thừa khi đã có SSE — SSE là HTTP long-lived connection với format chuẩn, tại sao không dùng.

### Server-Sent Events + Redis pub/sub
Overkill cho single-process Bun server. Redis chỉ cần khi horizontal scale, không phải mục tiêu M1–M10.

## References

- `src/server/router.ts:169-207` — implementation
- `docs/superpowers/specs/2026-04-21-streaming-tokens-fix-design.md` — brainstorm dẫn tới M3.5 extension
- Commit `4ef5b49` — WebSocket → SSE migration
