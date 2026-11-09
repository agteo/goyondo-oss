import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { EventStore } from "../db/store.ts";
import { AuthService } from "./auth.ts";
import { loadKeys } from "./keys.ts";
import { createApp } from "./app.ts";
import { IngestService } from "../ingest/service.ts";
import { createLlmClient } from "../llm/adapter.ts";

// Fill unset variables from .env. Values already in the environment win, so Docker Compose
// overrides stay in effect. A missing file is fine: local defaults are enough to start.
function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const dataDir = process.env.CE_DATA_DIR || "data";
mkdirSync(dataDir, { recursive: true });
const store = new EventStore(`${dataDir}/ce.sqlite`);
const auth = new AuthService(store.db);
const keys = loadKeys();
const ingest = new IngestService(store, `${dataDir}/files`);
const llm = createLlmClient({
  apiKey: keys.llmApiKey,
  baseUrl: keys.llmBaseUrl,
  model: keys.llmModel,
});
const app = createApp({
  store,
  auth,
  keys,
  ingest,
  llm,
  secureCookies: process.env.CE_SECURE_COOKIES === "1",
});

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Goyondo CE listening on http://127.0.0.1:${port}`);
});
