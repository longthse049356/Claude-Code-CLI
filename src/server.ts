import { initDatabase } from "./server/database.ts";
import { handleRequest } from "./server/router.ts";
import { resumeAll } from "./agent/worker-manager.ts";
import { log } from "./server/logger.ts";

initDatabase();
resumeAll(); // Restart any agents persisted in DB from previous runs

Bun.serve({
  port: 3456,
  fetch(req) {
    const pathname = new URL(req.url).pathname;

    // Bun hot-reload probe — ignore silently
    if (pathname === "/browser/ws") return new Response(null, { status: 404 });

    log(`\n[SERVER] ${req.method} ${pathname}`);
    return handleRequest(req);
  },
});

log("Clawd server running on http://localhost:3456");
log("Waiting for requests...\n");
