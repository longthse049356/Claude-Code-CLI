import { initDatabase } from "./server/database.ts";
import { handleRequest } from "./server/router.ts";
import { wsHandlers } from "./server/websocket.ts";

initDatabase();

Bun.serve({
  port: 3456,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      const upgraded = server.upgrade(req, { data: undefined });
      if (!upgraded) return new Response("WS upgrade failed", { status: 400 });
      return;
    }
    return handleRequest(req);
  },
  websocket: wsHandlers,
});

console.log("Clawd server running on http://localhost:3456");
