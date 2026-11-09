import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventStore } from "../../src/db/store.ts";
import { AuthService } from "../../src/http/auth.ts";
import { createApp, type CreateAppOpts } from "../../src/http/app.ts";
import { loadKeys } from "../../src/http/keys.ts";
import { IngestService } from "../../src/ingest/service.ts";
import type { LlmClient } from "../../src/llm/adapter.ts";
import type { WeatherFetcher } from "../../src/weather/adapter.ts";

export function makeHarness(overrides: Partial<CreateAppOpts> = {}) {
  const store = new EventStore();
  const auth = new AuthService(store.db);
  const ingest = new IngestService(store, mkdtempSync(join(tmpdir(), "ce-files-")));
  const app = createApp({
    store,
    auth,
    keys: loadKeys({}),
    ingest,
    ...overrides,
  });
  return { app, store, auth, ingest };
}

export async function operatorSession(app: ReturnType<typeof createApp>, username = "alex", password = "secret") {
  const res = await app.request("/register", {
    method: "POST",
    body: new URLSearchParams({ username, password }),
  });
  return res.headers.get("set-cookie") ?? "";
}

export function cookieHeader(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}
