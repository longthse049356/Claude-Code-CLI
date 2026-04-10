# M6: Memory System

**Concept:** Session persistence, FTS5 knowledge base, long-term agent memories

## What you'll build

```
src/
├── memory/
│   ├── session-history.ts    — Save/load conversation history
│   ├── knowledge-base.ts     — FTS5-indexed tool outputs
│   ├── agent-memories.ts     — Long-term facts per agent
│   └── memory-manager.ts     — Orchestrate 3 tiers
├── server/
│   └── database.ts           — Add memory.db
└── ...
```

## Scope

- **Session history:** Save full conversation to SQLite, restore on agent restart
- **Knowledge base:** Index tool outputs (file contents, bash results) with SQLite FTS5. Agent searches via natural language
- **Agent memories:** Facts, preferences, decisions saved by agent. Persist across sessions
- Auto-extraction: after each conversation, extract "memorable" facts
- Memory injection: relevant memories injected into system prompt each LLM call
- Secret blocklist: API keys, passwords blocked from saving

## Test cases

1. Chat → restart server → agent remembers old conversation
2. Agent reads file X → search "content of file X" → found in knowledge base
3. "Remember that I prefer TypeScript over JavaScript" → memory saved
4. New session → agent mentions "you prefer TypeScript"
5. Try saving "API key is sk-xxx" → blocked

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **FTS5** | SQLite Full-Text Search — search text by natural language | Like Ctrl+F but fuzzy, ranked by relevance |
| **3-tier memory** | Session (RAM) → Knowledge (indexed) → Long-term (persistent) | Like state → cache → localStorage |
| **Memory extraction** | Automatically pull facts from conversation | Like auto-save in Google Docs |
| **Memory injection** | Inject relevant memories into prompt before each LLM call | Like hydration — inject server data into client |

## Clawd docs to read

`memory.md` — the entire file. This is the most detailed doc about the memory system.

## After this milestone

You understand how AI agents retain knowledge across sessions. Context window = short-term memory. This milestone adds long-term memory.
