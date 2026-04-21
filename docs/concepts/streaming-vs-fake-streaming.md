# Streaming vs Fake Streaming — Concept Note

**Date:** 2026-04-21
**Context:** Sau khi brainstorm M3.5, phát hiện mình đã confuse giữa "có SSE = có streaming". Thực ra SSE chỉ là transport, streaming hay không tùy vào data flow upstream.

---

## TL;DR

**Streaming = data chảy theo thời gian thực, không cần đợi hoàn thành để bắt đầu hiển thị.**

Trong web, có 3 lớp riêng biệt cần match nhau thì mới thành "real streaming":

1. **Transport layer** — kênh giữ connection mở (HTTP chunked / SSE / WebSocket).
2. **Upstream producer** — có đẩy data từng phần ra không, hay chờ xong mới đẩy 1 phát?
3. **Downstream consumer** — có render từng phần không, hay đợi đủ mới render?

Nếu chỉ có (1) mà thiếu (2) hoặc (3) → **fake streaming**. User experience giống như đợi load xong cả trang rồi hiển thị.

---

## Analogy FE đã biết

### SSE không tự động = streaming

SSE giống `EventSource` trong browser:

```js
const es = new EventSource('/stream');
es.addEventListener('token', (e) => console.log(e.data));
```

Nhưng data có **thật sự chảy ra** qua kênh đó không phụ thuộc vào **upstream** (server-side producer).

Ví dụ fake streaming:
```js
// Server (pseudocode)
app.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  const fullData = await fetchEntireThingFromDB(); // ← block 5s
  res.write(`data: ${fullData}\n\n`);
  res.end();
});
```

Client dùng EventSource → chỉ nhận 1 event sau 5s. Transport đúng chuẩn SSE, nhưng không phải streaming.

### `useEffect` subscribe vs `useEffect` polling

```js
// Push-based (real streaming)
useEffect(() => {
  const ws = new WebSocket('/ws');
  ws.onmessage = (e) => setState((s) => [...s, e.data]);
  return () => ws.close();
}, []);

// Pull-based (polling — có thể là fake streaming)
useEffect(() => {
  const id = setInterval(async () => {
    const data = await fetch('/messages').then(r => r.json());
    setState(data);
  }, 500);
  return () => clearInterval(id);
}, []);
```

Cả 2 đều có thể "trông giống streaming" với user nếu interval đủ nhỏ. Nhưng pull-based có **inherent latency = interval/2** trung bình.

---

## Case study — Clawd Rebuild project (M2 → M3.5)

### M2/M3 — Fake streaming

Data flow gõ 1 message:

```
[User gõ] → POST /messages/stream
               ↓
[Server] save vào SQLite
               ↓
[Server] mở SSE stream, loop mỗi 500ms:
           - Query SQLite: "có assistant reply nào mới không?"
           - Nếu không → sleep 500ms, lặp lại
           - Nếu có → emit "done" với full text
               ↑
[Worker loop]  tick mỗi 1s:
  - Phát hiện user msg mới
  - Gọi Anthropic SDK stream...
  - Nhưng đợi stream.finalMessage() → block 5-15s
  - Save toàn bộ reply vào SQLite
```

**Nhận xét:**
- Transport layer (SSE): ✅ đúng
- Upstream producer (LLM → DB): ❌ block, không stream từng token
- Downstream consumer (React UI): ✅ đúng, có handle `event: token` — nhưng không bao giờ nhận được event đó

→ User thấy spinner "Thinking…" suốt rồi text nhảy ra cả block = **fake streaming**.

### M3.5 — Hybrid streaming

Thêm 1 layer in-memory ở giữa:

```
[Anthropic SDK] emit token (delta)
       ↓ callback onToken
[Worker] appendToken(channelId, delta)
       ↓
[In-memory Map] tokenStore["ch-1"] += delta
       ↑ polled mỗi 500ms
[SSE handler] getTokensSince(channelId, lastOffset)
       ↓ nếu có delta → emit "event: token"
[React UI] append vào draft message
```

Giờ:
- Transport layer (SSE): ✅
- Upstream producer: ✅ (có callback push tokens vào store)
- Downstream consumer: ✅
- **Middle layer: poll-based** (500ms latency trung bình 250ms)

→ **Streaming thật**, nhưng có 250ms "friction" do pull-based middle. User không nhận ra.

### Tương lai M7 — Pure push streaming

Khi có multi-agent, polling vỡ → refactor sang EventEmitter:

```
[Worker] emitter.emit("token", { channelId, agentId, delta })
       ↓ subscribe
[SSE handler] emit "event: token" ngay lập tức
```

Latency ~0ms, nhưng complexity cao hơn (subscribe lifecycle, backpressure, multi-subscriber).

---

## Thuật ngữ cần nhớ

| Term | Nghĩa | Analogy FE |
|---|---|---|
| **SSE** (Server-Sent Events) | HTTP response giữ connection mở, gửi nhiều events kiểu `event: X\ndata: Y\n\n` | `EventSource` browser API |
| **Chunked transfer encoding** | HTTP header `Transfer-Encoding: chunked` cho phép body gửi từng chunk | Gốc của SSE |
| **ReadableStream** | Node/Bun/browser stream interface, push hoặc pull chunks | Giống async iterator |
| **Push vs Pull** | Ai chủ động: producer push xuống (EventEmitter) hay consumer pull lên (polling)? | Redux `subscribe` (push) vs `setInterval(getState)` (pull) |
| **Backpressure** | Consumer xử lý chậm hơn producer → cần mechanism để producer giảm tốc | Giống `React.startTransition` hoặc throttle scroll handlers |
| **Delta** | Phần data mới từ lần check trước | `Array.slice(lastIndex)` |
| **In-memory store** | `Map` / `Set` trong process memory, mất khi restart | Giống Zustand store (nhưng ở server) |
| **Source of truth** | Nơi data "thật", các cache khác đồng bộ từ đây | SQLite ở project này |

---

## Common pitfalls — 3 lỗi FE hay mắc khi vào BE streaming

### Pitfall 1: "Tôi có SSE nên có streaming"
→ SAI. Phải check upstream producer có stream thật không.

### Pitfall 2: "Polling là xấu, phải dùng push ngay"
→ Không đúng luôn. Polling với interval 500ms ở 1 process duy nhất = đơn giản hơn push nhiều. Chỉ refactor khi có **nhu cầu thật** (latency-sensitive, multi-producer, distributed).

### Pitfall 3: "Save partial state vào DB để client F5 load lại được"
→ Dễ fail. Partial state phức tạp (đang ở giữa tool loop?). Tốt hơn: in-memory cho partial, DB cho committed. F5 load final state từ DB, mất draft đang stream = acceptable.

---

## Questions to self (future)

- Tại M7 multi-agent: khi nào nên migrate từ poll-based sang EventEmitter? Dấu hiệu?
- Tại M10 UI: có nên dùng libraries như `streamdown` cho render markdown streaming không?
- Làm sao test streaming behavior mà không flaky? (M3.5 plan Task 5 tránh HTTP integration test cho đơn giản — đúng hay cheat?)

Ghi lại ở journal khi gặp.
