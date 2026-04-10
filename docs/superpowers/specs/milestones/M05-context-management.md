# M5: Context Management

**Concept:** Token counting, message scoring, compression, sliding window

## What you'll build

```
src/
├── agent/
│   ├── context/
│   │   ├── token-counter.ts  — Approximate token counting
│   │   ├── scorer.ts         — Score messages by importance
│   │   ├── compactor.ts      — Compress old messages to summary
│   │   └── builder.ts        — Build final messages array for LLM call
│   └── worker-loop.ts        — Integrate context builder
└── ...
```

## Scope

- Token counting: approximate tokens per message
- Context budget: `max_tokens * 0.75` = threshold, `0.95` = critical
- Message scoring: system prompt (10), recent messages (8), error tool results (7), older messages (3)
- Compaction: messages older than 20 turns → summarize into 1 message
- Hybrid history: 20 most recent messages kept intact, rest compressed
- Critical reset: if exceeding 95% → keep only system prompt + 5 last messages

## Test cases

1. Chat 10 turns → context sent contains all 10 messages
2. Chat 50 turns → 30 old messages compressed into summary
3. Check token count before and after compaction
4. Force critical reset → only system prompt + 5 most recent remain
5. Large tool result (long file) → truncated, doesn't break context

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **Context window** | Max text LLM can read in one call (128-200K tokens) | Like viewport — only the visible part |
| **Token** | LLM text unit, ~4 chars English, ~1-2 chars Vietnamese | Like character count but for AI |
| **Compaction** | Summarize old messages to save tokens | Like virtualized list — only render visible rows |
| **Scoring** | Rank importance to decide which messages to keep/drop | Like priority queue |
| **Sliding window** | Keep N recent messages, compress the rest | Like infinite scroll — load more when needed |

## Clawd docs to read

`architecture.md` — Context Management, Token Compaction sections.

## After this milestone

You understand the engineering challenge every AI tool must solve. Claude Code "forgetting" old conversation isn't a bug — it's context management compacting. After M5 you know why AI sometimes "forgets" what you just said.
