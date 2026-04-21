# Journal — 2026-04-21: Streaming debug session

**Context:** Brainstorm M3.5 sau khi phát hiện UI chat "đợi mù" 5-15s rồi text nhảy ra cả block.

---

## Câu chuyện

Mở session với intent "fix UI" — nghĩ vấn đề là `TypingIndicator` chỉ show 3 dots, muốn thêm progress thinking text.

Claude ngay lập tức pushback: *"Đây không phải vấn đề UI. Check BE trước."*

Đọc xong `anthropic.ts`, `worker-loop.ts`, `router.ts` mới thấy:
- "SSE streaming" hiện tại là **fake** — chỉ poll DB, không stream token nào từ LLM.
- `sendMessage` gọi `client.messages.stream()` nhưng vứt đi tất cả token, chỉ lấy `finalMessage()`.
- UI đã handle `event: token` sẵn từ M10, nhưng BE chưa từng emit event đó.

→ Vấn đề **architecture**, không phải UI.

Tiếp theo brainstorm scope: Nhỏ / Vừa / Lớn. Chọn Nhỏ (surgical). Viết design doc → spec → plan. 3 file.

---

## Insights (cái đáng nhớ)

### 1. "Bug UI" thường không phải bug UI
Khi user complain về UX (spinner lâu, text nhảy ra chậm, loading ức chế), **không nhảy vào fix UI**. Hỏi: "data flow đi từ đâu ra UI?" và trace ngược. 9/10 lần lỗi nằm ở upstream.

Áp dụng tương lai: mỗi lần định fix 1 component FE, tự hỏi "có data flow issue không?" trước.

### 2. Mình (user) thiếu BE intuition — đây là fact, không phải điểm yếu
Khi Claude hỏi "chọn Option A hay B (EventEmitter vs polling)", mình cứng họng — không biết trade-off là gì. Đã nói thẳng và Claude điều chỉnh: mình chỉ quyết định **scope** (FE concern: UX tới mức nào), Claude tự lo **giải pháp** (BE technique).

Pattern này đáng nhân rộng cho các milestone BE-heavy sau (M5 context management, M6 memory, M7 multi-agent, M8 MCP). **Nguyên tắc:** hỏi Claude quyết thay, nhưng yêu cầu justify bằng analogy FE quen.

### 3. Spec phải có section "Anti-patterns"
Mất cả buổi sáng fix bug với Sonnet vì Sonnet **tự ý** thêm retry, wrap try/catch, optimize polling cadence. Spec hiện tại chỉ nói "làm gì" → Sonnet fill in "làm thế nào" = chế cháo.

Fix: mỗi spec milestone có 1 section **"KHÔNG được làm"** liệt kê cụ thể ~10 anti-pattern. M3.5 spec đã làm thử, xem có hiệu quả không.

Test hypothesis: milestone tiếp theo (M5), xem Sonnet có tự ý thêm gì không nếu spec chỉ có "What", vs có "What + Anti-patterns".

### 4. Design doc + Spec + Plan = 3 file riêng, 3 audience
- **Design doc:** bạn đọc để hiểu **tại sao** chọn A thay vì B/C.
- **Spec:** Sonnet đọc để biết **cái gì** phải thay đổi (data structure, function signature, AC).
- **Plan:** Sonnet đọc để biết **thứ tự bước** và **cách verify** giữa bước.

Ban đầu định gộp → Claude phản đối đúng: gộp làm Sonnet phân tâm, bạn khó reference.

Pattern này nên dùng cho mọi milestone từ giờ.

### 5. "Surgical Changes" rule thật sự save được giờ
Thấy `react-markdown` render hơi xấu giữa cuộc brainstorm → instinct muốn fix luôn. Claude pushback: đây là vấn đề **khác** streaming, tách session sau. Ngay lúc đó cảm giác hơi bực, nhưng nghĩ lại: nếu gộp vào M3.5, sẽ thành spec 2 topic → Sonnet lost → buổi tối debug tiếp.

"Surgical" không phải giới hạn — là discipline bảo vệ focus.

---

## Process observations (meta)

### Brainstorming skill có value gì?

- Buộc hỏi từng câu 1 → không bị dồn dập.
- Buộc viết ra **vì sao chọn**, không phải **cái gì chọn** → sau này reference được.
- Buộc tách scope Nhỏ/Vừa/Lớn → dễ quyết.
- Buộc có hard gate "không code khi chưa approve design" → rule quan trọng nhất của project (CLAUDE.md) được enforce tự động.

### Writing-plans skill có value gì?

- Plan có code chính xác (before/after) cho từng step → Sonnet không tự chế.
- Có verify step sau mỗi thay đổi → catch bug sớm.
- Có commit sau mỗi task → rollback dễ.
- Self-review section cuối → Claude tự check placeholder / type consistency.

**Nhận xét:** 2 skill này bù đắp chính xác chỗ yếu của Sonnet. Claude Opus có khả năng plan tốt, Sonnet có khả năng thực thi nhanh. Dùng Opus viết plan, Sonnet thực thi = tối ưu.

### Đã tiết kiệm được gì?

Estimate nếu không có design doc + spec + plan:
- Sonnet code luôn → 2-3 iteration "tự tiện" → 3-4h debug.
- Mỗi iteration user phải test + feedback + Sonnet retry.

Với plan:
- Sonnet follow plan từng step → 1.5-2h implement.
- User chỉ cần approve commit, không cần debug.

Net: tiết kiệm **~2-3h** cho milestone này. Scale ra M5-M10 = **10-20h**.

**Lesson:** Thời gian viết design + spec + plan (~1.5h) là ROI cao nhất trong project.

---

## Skill gap để học tiếp

Sau buổi này, rõ ra mình thiếu:

1. **Push vs pull architecture** — khi nào chọn cái nào, trade-off thật.
2. **In-memory state patterns** — khi nào OK dùng `Map`, khi nào cần Redis, khi nào cần DB.
3. **SSE vs WebSocket trade-offs** — chưa hiểu sâu vì sao project đã migrate từ WS → SSE (commit 4ef5b49).
4. **Backpressure** — nghe nhiều nhưng chưa thực sự gặp case.

→ M7 và M8 sẽ chạm các concept này. Khi học, ghi lại ở `docs/concepts/`.

---

## TODO từ session này

- [ ] Implement M3.5 plan (6 tasks, ~2h).
- [ ] Sau M3.5 xong → brainstorm markdown rendering (react-markdown thay thế hay tune).
- [ ] Đọc Clawd source xem streaming architecture của họ (→ fill in `docs/clawd-notes/streaming-comparison.md`).
- [ ] Test hypothesis: spec có "Anti-patterns section" có giúp Sonnet không lạc không? So sánh M4 (không có) vs M3.5 (có).

---

## Quote của chính mình

> "Nhưng nếu chọn C mà bản thân tôi không phải 1 BE engineer thì nhiều khi không biết là nên chọn solution nào cho tốt nhất"

→ Self-aware rất tốt. Pattern giải quyết: để Claude decide tech, user decide scope. Ghi lại để áp dụng tương lai.
