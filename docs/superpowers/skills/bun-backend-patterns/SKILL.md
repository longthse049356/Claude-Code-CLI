---
name: bun-backend-patterns
description: Use when designing REST APIs, implementing repository/service/controller layers, optimizing SQLite queries, adding caching, setting up background jobs, structuring error handling and validation, or building middleware for Bun.serve() servers.
origin: adapted from https://github.com/affaan-m/everything-claude-code/blob/main/skills/backend-patterns/SKILL.md
---

# Backend Development Patterns

Backend architecture patterns and best practices for scalable server-side applications using Bun, TypeScript, and SQLite.

## When to Activate

- Designing REST API endpoints with `Bun.serve()`
- Implementing repository, service, or controller layers
- Optimizing database queries (N+1, indexing, prepared statements)
- Adding caching (in-memory, HTTP cache headers)
- Setting up background jobs or async processing
- Structuring error handling and validation for APIs
- Building middleware (auth, logging, rate limiting) for Bun

## API Design Patterns

### RESTful API Structure

```typescript
// PASS: Resource-based URLs
GET    /api/channels              # List resources
GET    /api/channels/:id          # Get single resource
POST   /api/channels              # Create resource
PUT    /api/channels/:id          # Replace resource
PATCH  /api/channels/:id          # Update resource
DELETE /api/channels/:id          # Delete resource

// PASS: Query parameters for filtering, sorting, pagination
GET /api/channels?status=active&sort=created_at&limit=20&offset=0
```

### Manual Routing Pattern (Bun.serve — no framework)

```typescript
export async function handleRequest(req: Request): Promise<Response> {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  // ["channels"]                     → POST /channels
  // ["channels", "abc", "messages"]  → GET/POST /channels/:id/messages

  if (req.method === "POST" && parts.length === 1 && parts[0] === "channels") {
    return createChannelHandler(req);
  }
  if (req.method === "GET" && parts.length === 3 && parts[2] === "messages") {
    return getMessagesHandler(parts[1]);
  }
  if (req.method === "POST" && parts.length === 3 && parts[2] === "messages") {
    return createMessageHandler(req, parts[1]);
  }

  return json({ error: "not found" }, 404);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

### Repository Pattern

```typescript
// Abstract data access logic
interface ChannelRepository {
  findAll(filters?: ChannelFilters): Channel[]
  findById(id: string): Channel | null
  create(data: CreateChannelDto): Channel
  update(id: string, data: UpdateChannelDto): void
  delete(id: string): void
}

class SQLiteChannelRepository implements ChannelRepository {
  private stmtFindAll = db.prepare("SELECT * FROM channels");
  private stmtFindById = db.prepare("SELECT * FROM channels WHERE id = ?");
  private stmtInsert = db.prepare(
    "INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)"
  );

  findAll(filters?: ChannelFilters): Channel[] {
    // bun:sqlite returns typed rows directly
    return this.stmtFindAll.all() as Channel[];
  }

  findById(id: string): Channel | null {
    return this.stmtFindById.get(id) as Channel | null;
  }

  // Other methods...
}
```

### Service Layer Pattern

```typescript
// Business logic separated from data access
class MessageService {
  constructor(private messageRepo: MessageRepository) {}

  async sendMessage(channelId: string, text: string): Promise<DbMessage> {
    // Business logic: validate channel exists
    const channel = channelRepo.findById(channelId);
    if (!channel) throw new ApiError(404, "channel not found");

    const msg: DbMessage = {
      id: crypto.randomUUID(),
      channel_id: channelId,
      text: text.trim(),
      role: "user",
      created_at: Date.now(),
    };

    this.messageRepo.create(msg);
    broadcast({ type: "new_message", data: msg });

    return msg;
  }
}
```

### Middleware Pattern (Bun.serve)

```typescript
// Higher-order function wrapping a handler
type Handler = (req: Request) => Promise<Response>;

function withAuth(handler: Handler): Handler {
  return async (req: Request) => {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      const user = verifyToken(token);
      // Attach user to request via headers or closure
      return handler(req);
    } catch {
      return json({ error: "Invalid token" }, 401);
    }
  };
}

// Usage in router
if (req.method === "DELETE" && parts[0] === "channels") {
  return withAuth(deleteChannelHandler)(req);
}
```

## Database Patterns

### SQLite Setup (bun:sqlite)

```typescript
import { Database, type Statement } from "bun:sqlite";

// PASS: WAL mode + prepared statements compiled once at init
let db: Database;
let stmtFindById!: Statement;
let stmtInsert!: Statement;

export function initDatabase(path = "chat.db"): void {
  db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");  // enables concurrent reads

  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Compile once here — never inside a request handler
  stmtFindById = db.prepare("SELECT * FROM channels WHERE id = ?");
  stmtInsert   = db.prepare("INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)");
}

// FAIL: BAD — .prepare() called on every request
export function getChannel(id: string): Channel | null {
  return db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as Channel | null;
}

// PASS: GOOD — reuse compiled statement
export function getChannel(id: string): Channel | null {
  return stmtFindById.get(id) as Channel | null;
}
```

### Query Optimization

```typescript
// PASS: GOOD: Select only needed columns
const stmt = db.prepare("SELECT id, name, created_at FROM channels WHERE status = ?");
const channels = stmt.all("active") as Channel[];

// FAIL: BAD: Select everything when you only need a few columns
const stmt = db.prepare("SELECT * FROM channels");
```

### N+1 Query Prevention

```typescript
// FAIL: BAD: N+1 query problem
const messages = getMessages();
for (const msg of messages) {
  msg.channel = getChannel(msg.channel_id);  // N queries
}

// PASS: GOOD: JOIN or batch fetch
const stmt = db.prepare(`
  SELECT m.*, c.name as channel_name
  FROM messages m
  JOIN channels c ON m.channel_id = c.id
  WHERE m.channel_id = ?
`);
const messages = stmt.all(channelId);
```

### Transaction Pattern

```typescript
// Use db.transaction() for atomic multi-step writes
const createChannelWithMessage = db.transaction(
  (channelData: Channel, msgData: DbMessage) => {
    stmtInsertChannel.run(channelData.id, channelData.name, channelData.created_at);
    stmtInsertMessage.run(msgData.id, msgData.channel_id, msgData.text, msgData.role, msgData.created_at);
  }
);

// Call like a regular function — rolls back automatically on throw
createChannelWithMessage(channel, message);
```

## Caching Strategies

### In-Memory Cache (no Redis)

```typescript
// Simple Map-based cache for this stack
class MemoryCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}

const channelCache = new MemoryCache<Channel>();

export function getChannel(id: string): Channel | null {
  const cached = channelCache.get(`channel:${id}`);
  if (cached) return cached;

  const channel = stmtFindById.get(id) as Channel | null;
  if (channel) channelCache.set(`channel:${id}`, channel, 5 * 60 * 1000); // 5min TTL

  return channel;
}
```

### Cache-Aside Pattern

```typescript
async function getChannelWithCache(id: string): Promise<Channel> {
  const cacheKey = `channel:${id}`;

  // Try cache
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Cache miss — fetch from DB
  const channel = stmtFindById.get(id) as Channel | null;
  if (!channel) throw new ApiError(404, "channel not found");

  // Update cache
  cache.set(cacheKey, channel, 5 * 60 * 1000);

  return channel;
}
```

## Error Handling Patterns

### Centralized Error Handler

```typescript
class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function errorHandler(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: error.message }, error.statusCode);
  }

  // Log unexpected errors
  console.error("Unexpected error:", error);

  return json({ error: "Internal server error" }, 500);
}

// Usage in router
export async function handleRequest(req: Request): Promise<Response> {
  try {
    return await routeRequest(req);
  } catch (error) {
    return errorHandler(error);
  }
}
```

### Retry with Exponential Backoff

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// Usage
const data = await fetchWithRetry(() => callExternalAPI());
```

## Authentication & Authorization

### JWT Token Validation

```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: "admin" | "user";
}

export function verifyToken(token: string): JWTPayload {
  try {
    // Use a JWT library or Bun's crypto APIs
    const payload = decodeAndVerify(token, process.env.JWT_SECRET!);
    return payload as JWTPayload;
  } catch {
    throw new ApiError(401, "Invalid token");
  }
}

export function requireAuth(req: Request): JWTPayload {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) throw new ApiError(401, "Missing authorization token");
  return verifyToken(token);
}

// Usage in handler
async function getMessagesHandler(req: Request, channelId: string): Promise<Response> {
  const user = requireAuth(req);
  const messages = getMessagesByChannel(channelId);
  return json(messages);
}
```

### Role-Based Access Control

```typescript
type Permission = "read" | "write" | "delete" | "admin";

interface User {
  id: string;
  role: "admin" | "moderator" | "user";
}

const rolePermissions: Record<User["role"], Permission[]> = {
  admin:     ["read", "write", "delete", "admin"],
  moderator: ["read", "write", "delete"],
  user:      ["read", "write"],
};

export function hasPermission(user: User, permission: Permission): boolean {
  return rolePermissions[user.role].includes(permission);
}

function requirePermission(permission: Permission, handler: Handler): Handler {
  return async (req: Request) => {
    const user = requireAuth(req);
    if (!hasPermission(user, permission)) {
      return json({ error: "Insufficient permissions" }, 403);
    }
    return handler(req);
  };
}

// Usage in router
if (req.method === "DELETE" && parts[0] === "channels") {
  return requirePermission("delete", deleteChannelHandler)(req);
}
```

## Rate Limiting

### Simple In-Memory Rate Limiter

```typescript
class RateLimiter {
  private requests = new Map<string, number[]>();

  check(identifier: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) ?? [];

    // Remove old requests outside window
    const recent = requests.filter(t => now - t < windowMs);

    if (recent.length >= maxRequests) return false; // exceeded

    recent.push(now);
    this.requests.set(identifier, recent);
    return true;
  }
}

const limiter = new RateLimiter();

export async function handleRequest(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";

  if (!limiter.check(ip, 100, 60_000)) { // 100 req/min
    return json({ error: "Rate limit exceeded" }, 429);
  }

  return routeRequest(req);
}
```

## Background Jobs & Queues

### Simple Queue Pattern

```typescript
class JobQueue<T> {
  private queue: T[] = [];
  private processing = false;

  async add(job: T): Promise<void> {
    this.queue.push(job);
    if (!this.processing) this.process();
  }

  private async process(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await this.execute(job);
      } catch (error) {
        console.error("Job failed:", error);
      }
    }

    this.processing = false;
  }

  protected async execute(_job: T): Promise<void> {
    // Override in subclass
  }
}

// Usage: async indexing without blocking the response
interface IndexJob { messageId: string }

class MessageIndexQueue extends JobQueue<IndexJob> {
  protected async execute(job: IndexJob): Promise<void> {
    await indexMessage(job.messageId);
  }
}

const indexQueue = new MessageIndexQueue();

// In handler: add to queue, return immediately
createMessage(msg);
indexQueue.add({ messageId: msg.id }); // non-blocking
return json(msg, 201);
```

## Logging & Monitoring

### Structured Logging

```typescript
interface LogContext {
  requestId?: string;
  method?: string;
  path?: string;
  userId?: string;
  [key: string]: unknown;
}

class Logger {
  private log(level: "info" | "warn" | "error", message: string, context?: LogContext) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    }));
  }

  info(message: string, context?: LogContext) { this.log("info", message, context); }
  warn(message: string, context?: LogContext) { this.log("warn", message, context); }
  error(message: string, error: Error, context?: LogContext) {
    this.log("error", message, { ...context, error: error.message, stack: error.stack });
  }
}

const logger = new Logger();

// Usage in handler
export async function handleRequest(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  logger.info("Request received", {
    requestId,
    method: req.method,
    path: new URL(req.url).pathname,
  });

  try {
    const res = await routeRequest(req);
    logger.info("Request completed", { requestId, status: res.status });
    return res;
  } catch (error) {
    logger.error("Request failed", error as Error, { requestId });
    return errorHandler(error);
  }
}
```

**Remember:** Backend patterns enable scalable, maintainable server-side applications. Choose patterns that fit your complexity level — don't add caching, queues, or RBAC until you need them.
