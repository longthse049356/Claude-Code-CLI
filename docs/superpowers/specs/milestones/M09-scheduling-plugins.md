# M9: Scheduling & Plugins

**Concept:** Cron scheduling, plugin architecture, skills system

## What you'll build

```
src/
├── scheduler/
│   ├── scheduler-manager.ts  — 10s tick loop, check cron/interval jobs
│   ├── cron-parser.ts        — Parse cron expressions
│   └── job.ts                — Job definition + execution via spaces
├── plugins/
│   ├── plugin-manager.ts     — Load/unload plugins
│   ├── tool-plugin.ts        — Plugin that adds tools
│   └── lifecycle-plugin.ts   — Plugin with hooks (beforeTool, afterTool)
├── skills/
│   └── skill-loader.ts       — Load SKILL.md files, trigger matching
└── ...
```

## Scope

- **Scheduler:** Cron, interval, one-shot jobs. Execute via spaces (isolated)
- **Plugin system:** `ToolPlugin` (adds tools) + `Plugin` (lifecycle hooks)
- **Skills:** SKILL.md format, 4-directory discovery, trigger matching
- Max 3 concurrent scheduled jobs
- Job persistence in scheduler.db

## Test cases

1. Schedule "every minute, check server status" → runs every minute
2. One-shot job "after 30s, send reminder" → fires once, auto-deletes
3. Load custom tool plugin → agent sees new tool
4. Create SKILL.md → agent auto-triggers when relevant
5. 4 concurrent jobs → only 3 run, 1 queued

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **Cron** | Schedule format: `"0 9 * * 1-5"` = 9am weekdays | Like `setInterval` but calendar-based |
| **Plugin** | Third-party code hooking into system lifecycle | Like React plugin/middleware — intercept events |
| **Skill** | Markdown file describing capability, auto-triggered when relevant | Like React component but for AI — reusable behavior |
| **Tick loop** | Check every 10s if any job needs to run | Like `requestAnimationFrame` — periodic check |

## Clawd docs to read

- `skills.md` — skill format and trigger matching
- `custom-tools.md` — custom tool format

## After this milestone

You understand how to make an AI system extensible. Anyone can add tools, plugins, or skills without modifying core code.
