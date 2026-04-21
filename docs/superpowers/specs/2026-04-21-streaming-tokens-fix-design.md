# Design — Real LLM Token Streaming (Fix UX "đợi mù")

**Date:** 2026-04-21
**Author:** Brainstorming session (Claude Opus 4.7 + user)
**Status:** Awaiting user approval → spec milestone M3.5
**Scope chosen:** **Nhỏ** (minimal surgical fix). Vừa/Lớn đã loại — note ở cuối để tham khảo cho M5/M6/M10.

---

## 1. Vấn đề hiện hữu

### 1.1 Triệu chứng (user-facing)

- Gõ message → spinner "Thinking…" hiển thị **toàn bộ thời gian** LLM gen response.
- Đợi 5–15s → text nhảy ra **một phát toàn bộ block**.
- Càng nhiều tool call, càng nhiều "Thinking…" → càng tệ.
- Đây không phải "chat streaming" theo nghĩa user quen (ChatGPT/Claude.ai/Cursor). Đây là **loading spinner đẹp**.

### 1.2 Root cause (kiến trúc)

Có **2 vấn đề độc lập** cùng gây ra triệu chứng:

#### Vấn đề A — Provider không stream tokens

File: `src/providers/anthropic.ts:103-114`

```ts
const stream = client.messages.stream({...});  // tên là "stream"
const finalMessage = await stream.finalMessage();  // nhưng chờ hết rồi mới dùng
```

→ `sendMessage()` gọi đúng API stream của Anthropic SDK, **nhưng không hook vào event `text` để pipe ra ngoài**. Tất cả token bị nuốt, chỉ trả `finalMessage` khi LLM gen xong.

→ Có sẵn `streamAssistantText()` ở `anthropic.ts:12-55` đã làm đúng (hook `stream.on("text", onToken)`), nhưng **worker-loop không dùng**.

#### Vấn đề B — SSE endpoint là "fake stream" (poll DB)

File: `src/server/router.ts:169-207` (POST `/channels/:id/messages/stream`)

```ts
while (Date.now() < deadline) {
  const progress = getProgress(channelId);
  if (progress && ...) controller.enqueue(sseEvent("progress", progress));

  const newMessages = getMessagesAfter(channelId, cursor);
  const reply = newMessages.find((m) => m.role === "assistant");
  if (reply) {
    controller.enqueue(sseEvent("done", { message: reply }));
    return;
  }
  await new Promise((r) => setTimeout(r, 500));  // poll mỗi 500ms
}
```

→ Endpoint **không stream từ LLM**. Nó chỉ:
1. Save user message vào DB.
2. Loop 500ms/lần, query DB tìm assistant row.
3. Khi worker-loop save xong reply → emit `event: done` (1 phát toàn bộ text).

→ Worker-loop chạy độc lập (file `worker-loop.ts:152` — `setTimeout(tick, 1000)`), không có channel push từ LLM xuống endpoint.

#### Hệ quả kết hợp

```
User gõ → POST /messages/stream
  ↓ save user msg vào DB
  ↓ router poll DB mỗi 500ms (chỉ thấy "progress: thinking")
  ↓
worker-loop tick (mỗi 1s) → thấy user msg mới
  ↓ setProgress("thinking")  ← router thấy → emit "progress" event (UI hiện "Thinking…")
  ↓ sendMessage() → BLOCK ở finalMessage() suốt 5-15s ← KHÔNG có token nào ra
  ↓ (nếu có tool) executeTool → setProgress("tool_call")
  ↓ sendMessage() lần nữa → BLOCK tiếp
  ↓ ...
  ↓ createMessage(reply) vào DB
  ↓
router thấy reply → emit "done" + full text ← TEXT XUẤT HIỆN Ở ĐÂY (lần đầu tiên)
```

→ **Token chưa từng chảy qua SSE.** UI có handler `event: token` ở `ChatPanel.tsx:90-105` nhưng không bao giờ nhận được event đó.

### 1.3 Vì sao tồn tại?

Không phải bug — đây là **kiến trúc M2/M3 hợp lệ**:
- M2 (Chat server): tập trung vào HTTP/SQLite, save → query là pattern tự nhiên.
- M3 (Agent loop): tập trung vào ReAct + worker polling, không yêu cầu real streaming.
- "Fake SSE" cho M3 là giải pháp đơn giản cho phép có spinner mà không cần pub/sub.

Vấn đề chỉ xuất hiện khi mục tiêu UX nâng lên ngang Claude Code/ChatGPT — tức là **bây giờ**.

---

## 2. Scope đã chọn: **Nhỏ**

### 2.1 Định nghĩa

Fix tối thiểu để **token chảy ra realtime**, **giữ nguyên architecture poll-DB** cho mọi thứ khác.

### 2.2 Thay đổi cần làm (3 file)

| File | Thay đổi |
|---|---|
| `src/agent/progress.ts` | Thêm in-memory **token store** song song progress store: `Map<channelId, string>` (tích lũy text streaming). API: `appendToken`, `getTokens`, `getTokensSince(offset)`, `clearTokens`. |
| `src/providers/anthropic.ts` | `sendMessage()` thêm optional `onToken?: (delta: string) => void`. Khi gọi `client.messages.stream(...)`, hook `stream.on("text", (t) => onToken?.(t))`. Vẫn return `finalMessage` như cũ — backward compat. |
| `src/agent/worker-loop.ts` | Truyền callback `onToken: (t) => appendToken(channel_id, t)` vào `sendMessage`. Trước mỗi `sendMessage` (cả lần đầu lẫn các lần trong tool loop): `clearTokens(channel_id)` để reset cho turn mới. Sau khi save reply → `clearTokens` final. |
| `src/server/router.ts` | Trong loop poll 500ms, ngoài `getProgress`, thêm `getTokensSince(channel_id, lastEmittedLength)`. Nếu có delta → emit `sseEvent("token", { text: delta })` và update `lastEmittedLength`. |

**Không đụng:**
- `packages/ui/**` (UI đã handle `event: token` đúng cách rồi).
- `src/server/database.ts`.
- Polling cadence (vẫn 500ms — xem 2.4 vì sao).
- `worker-loop.ts` cấu trúc tick/setTimeout.
- Tool execution flow.

### 2.3 Data flow sau khi fix

```
User gõ → POST /messages/stream
  ↓ save user msg vào DB
  ↓ router poll DB mỗi 500ms
    - getProgress → emit "progress" nếu thay đổi
    - getTokensSince(lastLen) → emit "token" với delta nếu có    ← MỚI
    - getMessagesAfter → nếu có reply → emit "done"
  ↓
worker-loop tick → thấy user msg mới
  ↓ clearTokens(channel)
  ↓ setProgress("thinking")
  ↓ sendMessage(..., { onToken: (t) => appendToken(channel, t) })
       └─► mỗi delta token → store cộng dồn → router (poll tiếp theo) thấy & emit
  ↓ (nếu tool) clearTokens trước khi sendMessage lần kế
  ↓ createMessage(reply) → router thấy → emit "done" + clearTokens
```

### 2.4 Vì sao **không** đổi polling cadence

- Polling 500ms = delta ~500ms giữa các batch token. Đủ mượt cho human eye (chữ vẫn "chảy", không phải đứng).
- Đổi cadence = thay đổi pattern, vi phạm "Surgical Changes".
- Nếu sau này thấy giật → đó là lúc cân nhắc Vừa (push-based). Không tối ưu sớm.

### 2.5 Trade-off của Nhỏ

**Tốt:**
- Surgical: 4 file, ~80 dòng code thêm/sửa, 0 dòng xóa.
- Backward compat: `onToken` optional → không phá test/code khác.
- Architecture không đổi → debug dễ như cũ.

**Chấp nhận:**
- Vẫn có lag 0–500ms giữa LLM emit token và UI thấy (do polling). Trong thực tế: không nhận ra.
- Tokens lưu in-memory → server restart giữa turn = mất phần đang stream (nhưng `createMessage` vẫn save khi xong → reload không mất). Acceptable cho M3.5.
- Tool call giữa turn vẫn hiện "tool_call" rồi reset text → UX hơi giật khi nhiều tool. Lớn fix cái này.

---

## 3. Why this, not Vừa/Lớn

### 3.1 Vừa — push-based pub/sub

**Mô tả:** Thay `Map` polling bằng `EventEmitter` (Node built-in). Worker `emit("token", {channelId, text})`. Router `subscribe` và push thẳng vào SSE controller. Bỏ loop poll 500ms.

**Tại sao loại (cho bây giờ):**
- Đụng pattern toàn bộ: phải refactor cả `progress` lẫn `tokens` → 5+ file.
- Phải handle subscribe/unsubscribe khi client disconnect → thêm complexity.
- Lợi ích: latency 0ms thay vì 250ms trung bình. **User không nhận ra**.
- Vi phạm "Simplicity First": chỉ nên làm khi có nhu cầu thực (multi-agent broadcast ở M7).

**Khi nào nên làm:** Khi M7 (Multi-agent & Spaces) cần 1 channel có 2+ agent cùng stream — lúc đó polling sẽ thật sự không đủ và pub/sub là kiến trúc đúng.

### 3.2 Lớn — Vừa + UX upgrade kiểu Claude Code

**Mô tả:** Vừa + tool call hiển thị thành **step list tích lũy** (không replace), kèm input preview & result summary. UI giống Claude Code:

```
✓ read_file src/agent/worker-loop.ts · 163 lines
✓ grep "progress" · 24 matches
⟳ Thinking...
[response text streaming...]
```

**Tại sao loại (cho bây giờ):**
- Yêu cầu thay schema `ProgressStatus` (thêm `inputPreview`, `resultSummary`).
- Refactor `TypingIndicator` thành component giàu hơn → phá UI hiện tại.
- Cần thiết kế UX kỹ → đáng làm milestone riêng.
- Không liên quan trực tiếp tới root cause (token streaming).

**Khi nào nên làm:** M10 (Browser extension & React UI) — đây là milestone về UI/artifacts, đúng chỗ để upgrade UX này.

---

## 4. Acceptance criteria (verify được)

Mỗi tiêu chí test bằng tay được, không cần unit test mới:

- [ ] **AC1 — Token chảy realtime:** Gõ "viết cho tôi 1 đoạn 500 chữ về Bun runtime". Chữ đầu tiên xuất hiện **trong < 2s** kể từ lúc nhấn Enter (không còn đợi mù 5–15s).
- [ ] **AC2 — Tool call vẫn hoạt động:** Gõ "đọc file package.json và tóm tắt". UI hiển thị "Calling read_file…" → sau đó text tóm tắt chảy ra (không vỡ flow).
- [ ] **AC3 — Multi-tool turn:** Gõ "đọc file package.json, sau đó grep từ 'bun' trong src". UI hiển thị tuần tự các tool, sau đó text reply chảy ra.
- [ ] **AC4 — DB persistence:** Sau khi message hoàn tất, F5 refresh → message vẫn ở đó (cả user và assistant).
- [ ] **AC5 — Test cũ pass:** `bun test src/server/sse.test.ts src/server/sse-polling.test.ts src/server/sse-http.test.ts src/server/stream-message.test.ts` — tất cả pass.
- [ ] **AC6 — UI không đụng:** `git diff main -- packages/ui/` rỗng (không có thay đổi nào trong FE).
- [ ] **AC7 — TypeScript strict:** `bun run typecheck` pass.
- [ ] **AC8 — Connection drop graceful:** Trong lúc stream, kill Bun server (Ctrl+C) → FE hiện error state, không crash. Restart server, F5 → UI load message cũ từ DB.

---

## 5. Note cho tương lai (Vừa & Lớn)

Lưu ở đây để các milestone sau có pointer rõ ràng:

### Cho M7 (Multi-agent & Spaces) — cân nhắc Vừa
- Nếu 2 agent cùng channel cùng stream → polling + cộng dồn 1 string sẽ vỡ.
- Lúc đó refactor `progress.ts` + `tokens` thành `EventEmitter` per channel. Mỗi event có `agentId`. Router subscribe và route theo `agentId` xuống FE.
- Bỏ luôn loop poll 500ms ở `router.ts`.

### Cho M10 (Browser extension & React UI) — cân nhắc Lớn
- Đổi `ProgressStatus` schema:
  ```ts
  | { type: "tool_call"; toolName: string; iteration: number; inputPreview: string }
  | { type: "tool_done"; toolName: string; resultSummary: string; durationMs: number }
  ```
- Worker-loop tính `inputPreview` (truncate input đầu tiên), `resultSummary` (line count / match count tùy tool).
- FE: `TypingIndicator` → `ToolStepList` component, accumulate steps thay vì replace, collapsible.
- Có thể kết hợp với artifacts pattern (M10) để render kết quả tool đẹp hơn.

### Anti-patterns cần tránh
- **KHÔNG** dùng WebSocket lại — đã migrate sang SSE ở commit `4ef5b49`, có lý do (xem commit).
- **KHÔNG** stream tool_use blocks (chỉ stream text). Tool execution là deterministic, stream nó vô nghĩa & dễ bug.
- **KHÔNG** save partial text vào DB. DB chỉ lưu final reply (giữ source of truth sạch).

---

## 6. Quyết định đã chốt (resolved questions)

### Q1 — Test mới? **CÓ, nhưng chỉ 2 test.**

Thêm 2 test trong `src/server/sse-polling.test.ts` (tận dụng pattern có sẵn, không tạo file mới):

- **Test A:** `appendToken("ch-test", "Hello")` → SSE stream phải emit `event: token` với `data: {"text":"Hello"}` trong < 1s.
- **Test B:** Gọi `appendToken("ch-test", "Hello")`, `appendToken("ch-test", " ")`, `appendToken("ch-test", "world")` tuần tự → SSE phải emit **3 token events tích lũy đúng thứ tự**, không trùng (mỗi event chỉ chứa **delta**, không phải full text), không sót.

**Không** thêm test cho `anthropic.ts` (mock SDK = phức tạp, ROI thấp). Manual AC1–AC3 cover.

### Q2 — Debounce/batch `appendToken`? **KHÔNG.**

Lý do:
- Anthropic SDK đã batch tokens ở mức hợp lý (vài tokens/event, không phải char-by-char).
- Polling 500ms ở router tự nhiên là "debounce ở downstream" rồi.
- Double debounce (upstream + downstream) → giật, không mượt thêm.

### Q3 — Error handling khi LLM stream fail? **GIỮ NGUYÊN.**

Flow hiện tại đúng:
- `sendMessage` throw → `worker-loop.tick()` catch → không emit "done"
- Router `setTimeout(120s)` → emit "error" event
- UI nhận "error" → hiện retry button (`ChatPanel.tsx:213`)

**Implementation rule:** Khi `sendMessage` throw giữa stream:
- KHÔNG được swallow error.
- KHÔNG retry.
- Trong `worker-loop.tick()` catch: gọi `clearProgress(channel_id)` nhưng KHÔNG `clearTokens` (để debug được nếu cần — sẽ tự bị overwrite ở turn sau).
- Throw lên trên để log (đã có `log()` ở catch).

---

## 7. Anti-patterns — KHÔNG được làm khi implement

Section này tồn tại vì user đã mất 1 buổi sáng debug với Sonnet do các "tự tiện improvements". Spec milestone sẽ copy section này vào.

- ❌ Thêm retry logic ở provider hoặc worker (network resilience là job của Anthropic SDK).
- ❌ Wrap try/catch quanh `client.messages.stream()` để "graceful degrade" (nuốt lỗi → user không biết bug).
- ❌ Debounce/batch token callback (xem Q2).
- ❌ Thêm WebSocket fallback (đã migrate sang SSE ở commit `4ef5b49`).
- ❌ "Optimize" polling cadence (giữ 500ms, xem 2.4).
- ❌ Tạo abstraction (vd `TokenStreamManager` class) — chỉ functions thuần, đặt cạnh `progress.ts` patterns.
- ❌ Đổi signature `sendMessage` thành breaking (`onToken` PHẢI optional để các call site khác không break).
- ❌ Save partial text vào DB (DB chỉ lưu final reply, source of truth phải sạch).
- ❌ Refactor `progress.ts` thành class hay đổi API hiện có (chỉ ADD `tokens` store, không touch progress code).
- ❌ Đổi `worker-loop.ts` cấu trúc tick/setTimeout.
- ❌ Đụng vào `packages/ui/**`.

---

## 8. Next step

User review design này → nếu approve → tôi viết spec milestone:
`docs/superpowers/specs/milestones/M3.5-streaming-tokens.spec.md`

Spec sẽ theo đúng format CLAUDE.md (8 sections, function signatures chính xác, line count estimate per file) để Sonnet/Haiku implement không bị lạc.
