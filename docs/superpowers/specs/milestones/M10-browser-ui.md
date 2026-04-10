# M10: Browser Extension & React UI

**Concept:** Chrome MV3 extension, React UI, artifact rendering, single binary

## What you'll build

```
packages/
├── ui/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── Composer.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── ArtifactRenderer.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── App.tsx
│   └── vite.config.ts
├── browser-extension/
│   ├── manifest.json
│   ├── background.ts
│   └── content-script.ts
```

## Scope

- **UI:** Slack-inspired chat, real-time via WebSocket, artifact rendering (HTML/React/SVG/Chart)
- **Browser extension:** Chrome MV3, CDP mode (navigate, click, screenshot, extract DOM)
- Embed UI into server binary (`Bun.build`)
- 8 artifact types: html, react, svg, chart, csv, markdown, code, interactive

## Test cases

1. Open `localhost:3456` → UI loads, channel list visible
2. Type message → agent replies real-time with streaming text
3. Agent creates HTML artifact → renders in sandboxed iframe
4. Agent calls browser tool "navigate to google.com" → extension executes
5. Agent takes screenshot → image displayed in chat

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **Artifact** | Rich content (HTML/chart/code) rendered in sandbox iframe | Like CodePen embed — isolated rendering |
| **CDP** | Chrome DevTools Protocol — control browser programmatically | Like Puppeteer/Playwright |
| **MV3** | Chrome extension Manifest V3 — service worker based | You already know if you've written extensions |
| **Embed UI** | Build React → bundle into server binary | Like Next.js static export but embedded in Bun |

## Clawd docs to read

- `ui-design-system.md` (42KB) — full React design system
- `artifacts.md` — artifact types and protocol

## After this milestone

You've built a full-stack AI agent platform. From terminal chatbot to multi-agent chat with browser automation, memory, scheduling, and MCP integration.
