import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const AUTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
`;

export class AuthService {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(AUTH_SCHEMA);
  }

  hasOperator(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM operators").get() as { n: number };
    return row.n > 0;
  }

  register(username: string, password: string): { ok: true } | { ok: false; status: 403; error: string } {
    if (this.hasOperator()) {
      return { ok: false, status: 403, error: "operator already exists" };
    }
    const id = randomBytes(16).toString("hex");
    const password_hash = hashPassword(password);
    this.db
      .prepare("INSERT INTO operators (id, username, password_hash) VALUES (?, ?, ?)")
      .run(id, username, password_hash);
    return { ok: true };
  }

  login(username: string, password: string): string | undefined {
    const row = this.db
      .prepare("SELECT id, password_hash FROM operators WHERE username = ?")
      .get(username) as { id: string; password_hash: string } | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) {
      return undefined;
    }
    const sessionId = randomBytes(24).toString("hex");
    this.db.prepare("INSERT INTO sessions (id, operator_id) VALUES (?, ?)").run(sessionId, row.id);
    return sessionId;
  }

  operatorFromSession(sessionId: string | undefined): string | undefined {
    if (!sessionId) {
      return undefined;
    }
    const row = this.db
      .prepare("SELECT operator_id FROM sessions WHERE id = ?")
      .get(sessionId) as { operator_id: string } | undefined;
    return row?.operator_id;
  }

  mintAgentToken(): string {
    this.db.prepare("UPDATE agent_tokens SET revoked = 1 WHERE revoked = 0").run();
    const plaintext = `gce_${randomBytes(24).toString("hex")}`;
    const id = randomBytes(8).toString("hex");
    this.db
      .prepare("INSERT INTO agent_tokens (id, token_hash, revoked) VALUES (?, ?, 0)")
      .run(id, sha256(plaintext));
    return plaintext;
  }

  authenticateBearer(token: string | undefined): boolean {
    if (!token) {
      return false;
    }
    const hash = sha256(token);
    const row = this.db
      .prepare("SELECT id FROM agent_tokens WHERE token_hash = ? AND revoked = 0")
      .get(hash) as { id: string } | undefined;
    return Boolean(row);
  }

  tokenPlaintextPersisted(plaintext: string): boolean {
    const rows = this.db.prepare("SELECT token_hash FROM agent_tokens").all() as { token_hash: string }[];
    return rows.some((row) => row.token_hash === plaintext);
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
