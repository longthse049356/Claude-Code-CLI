import { getAllAgents } from "../server/database.ts";
import { WorkerLoop } from "./worker-loop.ts";
import { log } from "../server/logger.ts";
import type { Agent } from "../types.ts";

// Module-level singleton — one Map per server process
const loops = new Map<string, WorkerLoop>();

export function startAgent(agent: Agent): void {
  if (loops.has(agent.id)) {
    log(`[MANAGER] agent "${agent.name}" already running, skipping`);
    return;
  }
  const loop = new WorkerLoop(agent);
  loop.start();
  loops.set(agent.id, loop);
  log(`[MANAGER] started agent "${agent.name}" (id=${agent.id}) in channel "${agent.channel_id}"`);
}

export function stopAgent(agentId: string): void {
  const loop = loops.get(agentId);
  if (!loop) {
    log(`[MANAGER] stopAgent: no running loop for id="${agentId}"`);
    return;
  }
  loop.stop();
  loops.delete(agentId);
  log(`[MANAGER] stopped agent id="${agentId}"`);
}

export function resumeAll(): void {
  const agents = getAllAgents();
  log(`[MANAGER] resuming ${agents.length} agent(s) from DB`);
  for (const agent of agents) {
    startAgent(agent);
  }
}
