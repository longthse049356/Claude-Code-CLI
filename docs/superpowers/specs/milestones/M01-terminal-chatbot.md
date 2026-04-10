# M1: Terminal Chatbot

**Concept:** LLM API, streaming, tool_use format

## What you'll build

```
src/
├── index.ts          — Entry point, readline loop
├── providers/
│   └── anthropic.ts  — Claude API call, streaming handler
└── types.ts          — Message, ToolUse, ToolResult types
```

## Scope

- Read API key from environment variable
- Send messages to Claude API (Anthropic SDK)
- Handle streaming response (token-by-token via SSE)
- Parse response: distinguish `text` block vs `tool_use` block
- Display tool_use blocks in terminal (no execution yet, just show JSON)
- Keep conversation history in-memory (array)

## Test cases

1. Type "Hello" → receive streaming text response
2. Type "Read file package.json" → receive tool_use block `{name: "read_file", input: {path: "package.json"}}` displayed as JSON
3. Chat 5 turns → context preserved (AI remembers previous messages)
4. Long message → streaming displays token-by-token, no waiting

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **LLM API** | HTTP endpoint receiving messages, returning text/tool_use | Like `fetch("/api/chat")` in Next.js |
| **Streaming (SSE)** | Server sends data chunk-by-chunk via event stream | Like `ReadableStream` when fetching video |
| **Messages array** | Each chat turn = 1 object `{role, content}`, LLM reads entire array | Like chat history in React state |
| **tool_use block** | LLM doesn't call functions — it outputs JSON describing what to call | Like `dispatch({type: "READ_FILE"})` in Redux |
| **Stop reason** | `end_turn` = done talking, `tool_use` = wants to call a tool | Like event type in event handler |

## Clawd docs to read

Not needed yet — this milestone is foundation common to all AI agents.

## After this milestone

You'll understand that Claude Code = send messages array to API, receive streaming response, parse tool_use blocks. No magic.
