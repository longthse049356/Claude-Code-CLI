import { Database, type Statement } from "bun:sqlite";
import type { Agent, Channel, DbMessage } from "../types.ts";
import { log } from "./logger.ts";

let db: Database;

// Prepared statements — compiled once, reused for every query
let stmtInsertChannel!: Statement;
let stmtGetChannel!: Statement;
let stmtInsertMessage!: Statement;
let stmtGetMessages!: Statement;
let stmtInsertAgent!: Statement;
let stmtGetAgent!: Statement;
let stmtGetAllAgents!: Statement;
let stmtDeleteAgent!: Statement;
let stmtUpdateAgentCursor!: Statement;
let stmtGetAgentByChannelAndName!: Statement;
let stmtGetMessagesAfter!: Statement;
let stmtGetAllChannels!: Statement;
let stmtGetAgentsByChannel!: Statement;
let stmtDeleteChannel!: Statement;
let stmtDeleteMessagesByChannel!: Statement;
let stmtDeleteAgentsByChannel!: Statement;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS channels (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT    PRIMARY KEY,
    channel_id TEXT    NOT NULL,
    text       TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'user',
    agent_name TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );

  CREATE TABLE IF NOT EXISTS agents (
    id                TEXT    PRIMARY KEY,
    name              TEXT    NOT NULL,
    channel_id        TEXT    NOT NULL,
    model             TEXT    NOT NULL,
    system_prompt     TEXT    NOT NULL DEFAULT '',
    last_processed_at INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );
`;

export function initDatabase(path = "chat.db"): void {
  db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  // Migration: add agent_name column if it doesn't exist yet (for existing databases)
  try {
    db.exec("ALTER TABLE messages ADD COLUMN agent_name TEXT NOT NULL DEFAULT ''");
    log(`[DB] migration: added agent_name column to messages`);
  } catch {
    // Column already exists — safe to ignore
  }

  // Compile statements once here
  stmtInsertChannel = db.prepare(
    "INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)"
  );
  stmtGetChannel = db.prepare(
    "SELECT * FROM channels WHERE id = ?"
  );
  stmtInsertMessage = db.prepare(
    "INSERT INTO messages (id, channel_id, text, role, agent_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmtGetMessages = db.prepare(
    "SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC"
  );
  stmtInsertAgent = db.prepare(
    "INSERT INTO agents (id, name, channel_id, model, system_prompt, last_processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  stmtGetAgent = db.prepare(
    "SELECT * FROM agents WHERE id = ?"
  );
  stmtGetAllAgents = db.prepare(
    "SELECT * FROM agents"
  );
  stmtDeleteAgent = db.prepare(
    "DELETE FROM agents WHERE id = ?"
  );
  stmtUpdateAgentCursor = db.prepare(
    "UPDATE agents SET last_processed_at = ? WHERE id = ?"
  );
  stmtGetAgentByChannelAndName = db.prepare(
    "SELECT * FROM agents WHERE channel_id = ? AND name = ?"
  );
  stmtGetMessagesAfter = db.prepare(
    "SELECT * FROM messages WHERE channel_id = ? AND created_at > ? ORDER BY created_at ASC"
  );
  stmtGetAllChannels = db.prepare(
    "SELECT * FROM channels ORDER BY created_at ASC"
  );
  stmtGetAgentsByChannel = db.prepare(
    "SELECT * FROM agents WHERE channel_id = ? ORDER BY created_at ASC"
  );
  stmtDeleteChannel = db.prepare(
    "DELETE FROM channels WHERE id = ?"
  );
  stmtDeleteMessagesByChannel = db.prepare(
    "DELETE FROM messages WHERE channel_id = ?"
  );
  stmtDeleteAgentsByChannel = db.prepare(
    "DELETE FROM agents WHERE channel_id = ?"
  );

  log(`[DB] opened "${path}" with WAL mode`);
  log(`[DB] prepared statements compiled`);
}

export function createChannel(id: string, name: string, createdAt: number): void {
  stmtInsertChannel.run(id, name, createdAt);
}

export function getChannel(id: string): Channel | null {
  const result = stmtGetChannel.get(id) as Channel | null;
  return result;
}

export function createMessage(msg: DbMessage): void {
  stmtInsertMessage.run(msg.id, msg.channel_id, msg.text, msg.role, msg.agent_name, msg.created_at);
}

export function getMessagesByChannel(channelId: string): DbMessage[] {
  const results = stmtGetMessages.all(channelId) as DbMessage[];
  return results;
}

// --- Agent CRUD Functions ---

export function createAgent(agent: Agent): void {
  stmtInsertAgent.run(
    agent.id,
    agent.name,
    agent.channel_id,
    agent.model,
    agent.system_prompt,
    agent.last_processed_at,
    agent.created_at
  );
}

export function getAgent(id: string): Agent | null {
  const result = stmtGetAgent.get(id) as Agent | null;
  return result;
}

export function getAllAgents(): Agent[] {
  const results = stmtGetAllAgents.all() as Agent[];
  return results;
}

export function deleteAgent(id: string): void {
  stmtDeleteAgent.run(id);
}

export function updateAgentCursor(id: string, lastProcessedAt: number): void {
  stmtUpdateAgentCursor.run(lastProcessedAt, id);
}

export function getAgentByChannelAndName(channelId: string, name: string): Agent | null {
  const result = stmtGetAgentByChannelAndName.get(channelId, name) as Agent | null;
  return result;
}

export function getMessagesAfter(channelId: string, cursor: number): DbMessage[] {
  const results = stmtGetMessagesAfter.all(channelId, cursor) as DbMessage[];
  return results;
}

export function getAllChannels(): Channel[] {
  const results = stmtGetAllChannels.all() as Channel[];
  return results;
}

export function getAgentsByChannel(channelId: string): Agent[] {
  const results = stmtGetAgentsByChannel.all(channelId) as Agent[];
  return results;
}

export function deleteChannel(id: string): void {
  stmtDeleteMessagesByChannel.run(id);
  stmtDeleteAgentsByChannel.run(id);
  stmtDeleteChannel.run(id);
}
