import type { ServerWebSocket } from "bun";
import type { WsBroadcast } from "../types.ts";

const clients = new Set<ServerWebSocket<unknown>>();

export const wsHandlers = {
  open(ws: ServerWebSocket<unknown>): void {
    clients.add(ws);
    console.log(`[WS] client connected. Total: ${clients.size}`);
  },

  close(ws: ServerWebSocket<unknown>): void {
    clients.delete(ws);
    console.log(`[WS] client disconnected. Total: ${clients.size}`);
  },

  message(_ws: ServerWebSocket<unknown>, _msg: string | Buffer): void {
    // M2: server → client only. Client messages are ignored.
  },
};

export function broadcast(data: WsBroadcast): void {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    client.send(payload);
  }
}
