// src/server/logger.ts
import { broadcast } from "./websocket.ts";

export function log(...args: unknown[]): void {
  const msg = args.map(String).join(" ");
  console.log(msg);
  broadcast({ type: "log", data: msg });
}
