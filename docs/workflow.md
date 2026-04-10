# Workflow Guide — Claude Code CLI

Hướng dẫn thực tế để làm việc hiệu quả với Claude Code CLI trong project này.

---

## Khi nào nên commit?

### Rule of thumb: "Commit trước khi Claude chạm vào code"

```
Trước khi:                          Sau khi:
├── Yêu cầu Claude sửa file        ├── Milestone acceptance criteria pass
├── Bắt đầu implement 1 feature    ├── Fix xong 1 bug
├── Thử refactor                   ├── Viết xong 1 file mới hoàn chỉnh
├── Chuyển sang milestone mới      └── Kết thúc session làm việc
└── Thử cách tiếp cận mới
```

### Checklist commit thực tế

```bash
# Trước khi yêu cầu Claude implement bất cứ thứ gì:
git add -A && git commit -m "checkpoint: before [mô tả ngắn]"

# Sau khi 1 bước nhỏ xong:
git add -A && git commit -m "feat(M1): add streaming handler"

# Khi milestone xong:
git add -A && git commit -m "feat: complete M1 terminal chatbot"
git tag M1-done
```

### Commit message format

```
feat(M1): add streaming response handler
fix(M2): correct WebSocket broadcast on reconnect
chore: update M1 acceptance criteria in spec
docs: add ADR-001 why Bun over Node.js
checkpoint: before refactoring provider layer
```

### Tại sao commit thường xuyên?

| Tình huống | Không commit | Đã commit |
|---|---|---|
| Claude sửa sai file | Mất code, không rollback được | `git diff` thấy ngay, `git checkout` lấy lại |
| Muốn so sánh trước/sau | Phải nhớ code cũ trong đầu | `git diff HEAD~1` |
| Claude đề xuất approach mới | Phải xóa code hiện tại | Tạo branch thử, không sợ mất |
| Session bị crash | Mất hết progress | Còn commit cuối cùng |

---

## Claude Code CLI Tips & Tricks

### Slash commands hay dùng nhất

| Command | Khi nào dùng |
|---|---|
| `/clear` | Bắt đầu session mới, context quá dài, chuyển sang task khác |
| `/compact` | Context dài nhưng muốn giữ lại conversation |
| `/memory` | Xem Claude đang nhớ gì về project |
| `/cost` | Kiểm tra chi phí session hiện tại |
| `/model` | Switch model (Opus cho planning, Sonnet cho coding) |
| `/review` | Review code đã viết trong session |

### Model selection theo task

```
Opus 4.6  → Brainstorming, architecture design, debug phức tạp
             "Tại sao cái này không work?"
             "Design pattern nào phù hợp?"

Sonnet 4.6 → Implement code theo spec, viết tests, refactor nhỏ
             "Implement hàm X theo spec này"
             "Viết test cases cho module Y"

Haiku 4.5 → Câu hỏi nhanh, format code, giải thích đơn giản
             "Giải thích dòng code này"
             "Format lại file này"
```

---

## Khi nào dùng Worktree?

**Worktree = làm việc trên branch riêng biệt, không ảnh hưởng code hiện tại.**

```bash
# Tạo worktree
/worktree feature-name
# hoặc
git worktree add .worktrees/experiment main
```

### Dùng worktree khi:

**Thử approach mới mà chưa chắc**
```
Đang implement M3 agent loop theo cách A.
Muốn thử cách B (event-driven thay vì polling) để so sánh.
→ Tạo worktree "try-event-driven", thử trong đó.
   Nếu tệ hơn, xóa worktree, giữ cách A.
   Nếu tốt hơn, merge vào main.
```

**Implement 2 milestones song song**
```
M2 server đang chờ test.
Muốn viết M3 agent loop trong khi chờ.
→ Worktree "m3-agent-loop", làm song song.
```

**Thử dependency mới**
```
Muốn thử dùng Hono thay vì raw Bun.serve().
→ Worktree "try-hono", không ảnh hưởng main.
```

### Không cần worktree khi:
- Fix bug nhỏ (< 30 phút)
- Sửa 1 file
- Thêm test

---

## Khi nào dùng Subagents?

**Subagent = Claude spawn agent con để làm task song song hoặc isolated.**

### Dùng subagents khi:

**Research song song với coding**
```
Bạn đang code M3 agent loop.
Cần hiểu cách Clawd implement worker-manager.ts.
→ Spawn subagent: "Đọc https://github.com/Tuanm/clawd/blob/main/src/worker-manager.ts
   và giải thích cách nó quản lý multiple workers"
→ Bạn tiếp tục code, subagent research song song.
```

**Viết test trong khi implement**
```
Đang viết src/providers/anthropic.ts.
→ Spawn subagent: "Viết test cases cho anthropic.ts dựa trên spec M1"
→ 2 việc chạy song song.
```

**Đọc nhiều files để hiểu context**
```
Cần hiểu toàn bộ tool system của Clawd.
→ Spawn subagent: "Đọc toàn bộ src/tools/ của Clawd và tóm tắt architecture"
→ Không tốn context window của session chính.
```

### Không cần subagent khi:
- Task sequential (phải xong A mới làm B)
- Task nhỏ (< 5 phút)
- Cần real-time feedback trong session

---

## Khi nào dùng Agent Teams?

**Agent Teams = nhiều agents chạy song song, mỗi cái có role riêng.**

### Phù hợp với milestone nào:

**M7+ (Multi-agent milestones)**
```
Đây là lúc bạn thực sự CẦN agent teams để test multi-agent behavior.
Agent A: implement worker-manager.ts
Agent B: viết collision avoidance tests
Agent C: research cách Clawd handle space timeout
```

**Khi implement tầng mới có nhiều files độc lập**
```
M4 Tool System: read-file.ts, write-file.ts, bash.ts, glob.ts, grep.ts
đều độc lập nhau.
→ 5 agents viết 5 handlers song song.
```

**Refactor lớn cuối milestone**
```
Sau M5, muốn refactor toàn bộ types.ts.
→ Agent 1: update types.ts
   Agent 2: update tất cả files import types
   Agent 3: chạy TypeScript checks
```

### Không nên dùng agent teams khi:
- Files có dependencies lẫn nhau (agent này cần output của agent kia)
- Task yêu cầu consistent decisions (1 agent biết context của cả project tốt hơn)
- Milestone nhỏ như M1, M2

---

## Tips theo từng Milestone

### M1: Terminal Chatbot
```
Model:    Sonnet (implementation straightforward)
Worktree: Không cần
Subagent: Dùng để đọc Anthropic SDK docs nếu cần
Team:     Không cần
Commit:   Sau mỗi file (index.ts, anthropic.ts, types.ts)

Tip: Thêm ANTHROPIC_API_KEY vào .env trước khi bắt đầu.
     Dùng `bun --hot run src/index.ts` để hot-reload khi dev.
```

### M2: Chat Server
```
Model:    Sonnet
Worktree: Tạo "m2-chat-server" branch
Subagent: Research Bun.serve() WebSocket API nếu stuck
Team:     Không cần
Commit:   Sau database schema, sau router, sau WebSocket

Tip: Test ngay với wscat: `bun add -g wscat`
     Dùng `bun run --watch src/index.ts` để tự restart.
```

### M3: Agent Loop
```
Model:    Opus cho design, Sonnet cho implement
Worktree: Nên dùng — agent loop là core, dễ break things
Subagent: Research Clawd worker-loop.ts song song
Team:     Không cần
Commit:   Sau mỗi thay đổi worker-loop (dễ regress)

Tip: Log polling events ra console để debug:
     console.log(`[${agentName}] poll tick, last_id=${lastId}`)
```

### M4: Tool System
```
Model:    Sonnet
Worktree: Branch "m4-tools"
Subagent: Viết handler tests song song với implementation
Team:     5 tool handlers độc lập → có thể dùng agent team
Commit:   Sau mỗi tool handler (read-file, bash, glob, grep, write-file)

Tip: Test từng tool riêng lẻ trước khi integrate vào worker loop.
     Bắt đầu với read-file (dễ nhất), kết thúc với bash (nguy hiểm nhất).
```

### M5: Context Management
```
Model:    Opus — logic phức tạp, cần reasoning tốt
Worktree: Nên dùng — thay đổi core worker loop
Subagent: Research tiktoken / token counting approaches
Team:     Không cần
Commit:   Sau token-counter, sau scorer, sau compactor (theo thứ tự)

Tip: Viết unit tests cho scorer và compactor trước khi integrate.
     Dễ bị off-by-one errors với token counting.
```

### M6: Memory System
```
Model:    Opus cho memory architecture design
Worktree: Branch "m6-memory"
Subagent: Đọc Clawd memory.md và src/memory/ song song
Team:     3 memory tiers khá độc lập → agent team khả thi
Commit:   Sau mỗi tier (session → knowledge → long-term)

Tip: Dùng sqlite3 CLI để verify data:
     `sqlite3 memory.db ".tables"` và `.dump`
```

### M7-M10
```
Tùy độ phức tạp của từng task, apply các patterns trên.
Viết spec trước, chọn model và tools phù hợp.
```

---

## Context Management

### Khi nào /clear?

```
- Context > 50% full → /compact trước, /clear nếu vẫn chậm
- Chuyển sang file/module hoàn toàn khác
- Bắt đầu milestone mới
- Session sáng hôm sau (fresh context tốt hơn)
```

### Tránh context bloat

```
✓ Cho Claude đọc file cụ thể thay vì paste toàn bộ code
✓ Dùng /compact khi conversation dài
✓ Start session mới với "Đọc CLAUDE.md để hiểu context"
✗ Đừng paste error logs dài — chỉ paste dòng error chính
✗ Đừng để 1 session xử lý cả 1 milestone (chia nhỏ)
```

---

## Quick Reference

```bash
# Bắt đầu session mới
"Đọc CLAUDE.md và cho tôi biết chúng ta đang ở đâu"

# Trước khi implement
git add -A && git commit -m "checkpoint: before M1 implementation"

# Trong khi implement — so sánh
git diff HEAD                    # thay đổi chưa commit
git diff HEAD~1                  # so với commit trước
git log --oneline -10            # 10 commits gần nhất

# Rollback nếu Claude làm sai
git checkout -- src/providers/anthropic.ts   # rollback 1 file
git reset --hard HEAD~1                       # rollback toàn bộ commit cuối

# Sau khi milestone xong
git tag M1-done
git push origin main --tags
```
