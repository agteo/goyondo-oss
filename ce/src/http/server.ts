import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { EventStore } from "../db/store.ts";
import { AuthService } from "./auth.ts";
import { loadKeys } from "./keys.ts";
import { createApp } from "./app.ts";
import { IngestService } from "../ingest/service.ts";
import { createLlmClient } from "../llm/adapter.ts";

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
