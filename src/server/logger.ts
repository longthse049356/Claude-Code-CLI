// src/server/logger.ts
export function log(...args: unknown[]): void {
  const msg = args.map(String).join(" ");
  console.log(msg);
}
