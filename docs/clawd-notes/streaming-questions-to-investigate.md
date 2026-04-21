# Clawd Notes — Streaming questions to investigate

**Status:** Open — questions, not answers
**Date:** 2026-04-21
**Why this file:** Brainstorm M3.5 phơi bày gap hiểu biết về streaming architecture. Clawd chắc chắn đã giải quyết các vấn đề này. Đọc Clawd code để so sánh, KHÔNG phải để copy.

---

## Context

Khi brainstorm M3.5, đã phát hiện architecture hiện tại (poll-DB) không stream được LLM tokens realtime. Fix Nhỏ là thêm in-memory token store + poll. Fix Vừa là refactor sang EventEmitter. Fix Lớn là thêm tool-call step list UI.

Clawd là reference implementation. Câu hỏi: họ đã chọn cách nào? Và lý do?

---

## Questions cần đọc Clawd để trả lời

### 1. Transport layer
- Clawd dùng WebSocket hay SSE cho chat streaming?
- Nếu SSE: họ handle tool-call progress events thế nào (data flow từ worker → endpoint)?
- Nếu WebSocket: có bi-directional gì ngoài message không (typing indicator, presence)?

**File Clawd cần đọc:**
- `src/server/` hoặc `src/api/` — routes cho messages
- Tìm keyword: `stream`, `sse`, `WebSocket`, `upgrade`

### 2. Worker ↔ HTTP handler coordination
- Clawd có tách worker loop riêng (giống M3) hay worker chạy **trong request handler** (giống M1 terminal)?
- Nếu tách: họ dùng pub/sub pattern gì — EventEmitter, Redis, DB polling, Bun's pub/sub?
- Có mechanism "client subscribe to channel events" không (để multi-tab same channel sync)?

**File Clawd cần đọc:**
- `src/agent/` hoặc tương đương — agent orchestration
- `src/db/` — xem có subscribe/notify pattern không

### 3. LLM token streaming
- Clawd có pipe từng token từ LLM SDK xuống client không, hay cũng đợi finalMessage?
- Nếu có pipe: token events có delta-based (giống M3.5 plan) hay full-accumulated mỗi event?
- Handle tool_use blocks giữa stream thế nào (LLM có thể emit tool_use giữa text)?

**File Clawd cần đọc:**
- Tìm `stream.on` hoặc `client.messages.stream` hoặc `streamingResponseChunk`
- Xem callback architecture

### 4. Tool call UX
- Clawd render tool call như thế nào trong UI? Step list, inline, hay modal?
- Có input preview / result summary không?
- Collapsible hay always-expanded?
- Hiển thị iteration count?

**File Clawd cần đọc:**
- React components cho message bubble
- Tìm keyword: `ToolCall`, `tool_use`, `ToolResult`

### 5. Error handling mid-stream
- LLM 429 / connection drop giữa stream: Clawd handle ở đâu?
- Auto-retry hay user click retry?
- Partial response có save vào DB không?

### 6. Architecture decisions có documented không?
- Clawd có `docs/adr/` hay `docs/architecture/` không?
- Nếu có, đọc để xem họ đã loại option nào và tại sao.

---

## Bias check trước khi đọc

**Cẩn thận với 2 bias sau khi so sánh:**

1. **"Clawd làm đúng, mình làm sai"** — KHÔNG. Clawd là 1 implementation, không phải ground truth. Project của mình có constraint khác (giáo dục, milestone-based). Đôi khi "sai" là quyết định đúng cho phase hiện tại.

2. **"Sao mình không làm giống họ từ đầu"** — Vì mình đang **học bằng cách build**. Nếu copy từ đầu sẽ không hiểu tại sao. Cảm giác "wow giá mà biết sớm" = minh chứng cho việc đang học đúng cách.

---

## Output khi đã đọc xong

Sau khi đọc Clawd, tạo file mới:
- `docs/clawd-notes/streaming-comparison.md` — so sánh concrete
- Update ADR 0001 nếu phát hiện Clawd có approach Option B thành công mà mình chưa nghĩ tới

**KHÔNG** override decision của mình chỉ vì Clawd khác. Chỉ override nếu có evidence cụ thể (performance number, bug report, user feedback).
