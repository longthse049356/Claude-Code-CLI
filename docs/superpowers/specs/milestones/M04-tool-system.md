# M4: Tool System

**Concept:** Tool schema, execution, path validation, sandbox basics

## What you'll build

```
src/
├── tools/
│   ├── registry.ts       — Tool registry: name → handler + schema
│   ├── schemas.ts        — JSON Schema per tool
│   ├── handlers/
│   │   ├── read-file.ts
│   │   ├── write-file.ts
│   │   ├── bash.ts       — Shell command execution (Bun.spawn)
│   │   ├── glob.ts
│   │   └── grep.ts
│   └── sandbox.ts        — Path validation, command filtering
├── agent/
│   └── worker-loop.ts    — Updated: tool_use → execute → loop
└── ...
```

## Scope

- Tool registry: map `{name, description, input_schema}` → handler function
- 5 basic tools: `read_file`, `write_file`, `bash`, `glob`, `grep`
- Worker loop extended: detect `tool_use` → execute → append `tool_result` → call LLM again
- Path validation: agent can only access files within project directory
- Bash timeout: commands running over 30s get killed
- Tool schemas sent to LLM in API call via `tools` parameter

## Test cases

1. "Read file package.json" → agent calls read_file → returns content
2. "Create file hello.txt with Hello World" → write_file → file created
3. "Run ls -la" → bash tool → listing result
4. "Find all .ts files" → glob tool → file list
5. "Read /etc/passwd" → BLOCKED by path validation
6. Agent chains tools: "Read file X then fix line 5" → read → write

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **Tool schema** | JSON describing tool name, description, parameters for LLM to understand | Like PropTypes — describing the interface |
| **Tool registry** | Map\<string, handler\> — lookup tool by name, execute | Like Redux reducer registry |
| **tool_result** | Response sent back to LLM after executing tool | Like API response in async thunk |
| **Function calling** | LLM outputs JSON specifying which function to call — server executes | Like RPC — client describes, server executes |
| **Sandbox** | Restrict tool to only access project directory, block dangerous paths | Like CORS — restrict cross-origin access |

## Clawd docs to read

- `custom-tools.md` — tool format
- `architecture.md` — Tool System & Sandbox Security sections

## After this milestone

**This is the milestone that transforms chatbot into agent.** Before M4, AI only talks. After M4, AI can read code, edit code, run commands. This is exactly what Claude Code and Cursor do. Nothing more.
