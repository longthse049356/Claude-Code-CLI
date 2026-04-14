import { initDatabase } from "./server/database.ts";
import { handleRequest } from "./server/router.ts";
import { wsHandlers } from "./server/websocket.ts";
import { resumeAll } from "./agent/worker-manager.ts";
import { log } from "./server/logger.ts";

initDatabase();
resumeAll();  // Restart any agents persisted in DB from previous runs


Bun.serve({
  port: 3456,
  fetch(req, server) {
    const pathname = new URL(req.url).pathname;

    // Bun hot-reload probe — ignore silently
    if (pathname === "/browser/ws") return new Response(null, { status: 404 });

    if (pathname === "/ws") {
      log(`[SERVER] WS upgrade request`);
      const upgraded = server.upgrade(req, { data: undefined });
      if (!upgraded) {
        log(`[SERVER] WS upgrade FAILED`);
        return new Response("WS upgrade failed", { status: 400 });
      }
      return; // upgrade thành công — không return Response
    }

    log(`\n[SERVER] ${req.method} ${pathname}`);
    return handleRequest(req);
  },
  websocket: wsHandlers,
});

log("Clawd server running on http://localhost:3456");
log("Waiting for requests...\n");
