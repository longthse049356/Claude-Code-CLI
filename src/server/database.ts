import { Database, type Statement } from "bun:sqlite";
import type { Channel, DbMessage } from "../types.ts";

let db: Database;

// Prepared statements — compiled once, reused for every query
let stmtInsertChannel!: Statement;
let stmtGetChannel!: Statement;
let stmtInsertMessage!: Statement;
let stmtGetMessages!: Statement;

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
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );

  CREATE TABLE IF NOT EXISTS agents (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    channel_id TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );
`;

export function initDatabase(path = "chat.db"): void {
  db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  // Compile statements once here
  stmtInsertChannel = db.prepare(
    "INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)"
  );
  stmtGetChannel = db.prepare(
    "SELECT * FROM channels WHERE id = ?"
  );
  stmtInsertMessage = db.prepare(
    "INSERT INTO messages (id, channel_id, text, role, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  stmtGetMessages = db.prepare(
    "SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC"
  );
}

export function createChannel(id: string, name: string, createdAt: number): void {
  stmtInsertChannel.run(id, name, createdAt);
}

export function getChannel(id: string): Channel | null {
  return stmtGetChannel.get(id) as Channel | null;
}

export function createMessage(msg: DbMessage): void {
  stmtInsertMessage.run(msg.id, msg.channel_id, msg.text, msg.role, msg.created_at);
}

export function getMessagesByChannel(channelId: string): DbMessage[] {
  return stmtGetMessages.all(channelId) as DbMessage[];
}
