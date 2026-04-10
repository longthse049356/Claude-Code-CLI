# M8: MCP Protocol

**Concept:** MCP server + client, tool exposure, JSON-RPC

## What you'll build

```
src/
├── mcp/
│   ├── server.ts         — MCP server: expose tools via /mcp endpoint
│   ├── client.ts         — MCP client: connect to external MCP servers
│   └── transport.ts      — SSE + HTTP transport layer
├── tools/
│   └── registry.ts       — Updated: merge local tools + MCP tools
└── ...
```

## Scope

- **MCP Server:** Expose 10+ tools via standard MCP protocol (`/mcp` endpoint)
- **MCP Client:** Connect to external MCP servers (e.g., filesystem, GitHub)
- Transport: Streamable HTTP (SSE for server→client, POST for client→server)
- Tool discovery: MCP client auto-discovers tools from external servers
- Tool namespacing: `mcp__servername__toolname` to avoid conflicts
- Authentication: Bearer token

## Test cases

1. Claude Code connects to `localhost:3456/mcp` → lists tools successfully
2. Claude Code calls `mcp__clawd__chat_send_message` → message appears in channel
3. Configure external MCP server → agent sees additional tools
4. Agent calls external MCP tool → result returned correctly

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **MCP** | Model Context Protocol — standard JSON-RPC for AI tools to communicate | Like REST API but specialized for AI tool-use |
| **MCP Server** | Expose tools for AI clients to call | Like API server — you define endpoints |
| **MCP Client** | Connect and call tools from external servers | Like API client — you fetch data |
| **Tool namespacing** | `mcp__server__tool` to avoid name conflicts | Like CSS modules — scoped naming |
| **JSON-RPC** | Protocol: `{method, params, id}` → `{result, id}` | Like fetch but with a calling convention |

## Clawd docs to read

`mcp-tools.md` — full 40+ tools reference.

## After this milestone

You understand MCP — the emerging "USB for AI." Like USB standardized hardware connections, MCP standardizes how AI tools communicate. This is the future of AI tooling.
