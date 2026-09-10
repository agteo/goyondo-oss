/**
 * Device auth (if needed) → list_trips. Optional: --create
 * Run from repo root: npx --yes tsx examples/typescript/quickstart.ts
 *
 * Pitfalls this flow demonstrates (see PITFALLS.md):
 * - Do not scrape /connect — POST /api/agent-auth/device first; the user opens verification_uri_complete.
 * - authorization_pending is normal while polling for the token.
 * - access_token is a one-time reveal — persist it (e.g. GOYONDO_API_KEY).
 * - list_trips with empty data is success.
 * - Task payloads use flat `arguments` (not nested under body).
 * - --create uses skip_ai_generation so the example does not bill an AI itinerary.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const BASE = process.env.GOYONDO_BASE_URL || "https://goyondo.run";
const CREATE = process.argv.includes("--create");

type DeviceResponse = {
  device_code: string;
  verification_uri_complete: string;
  interval?: number;
};

type TokenBody = {
  access_token?: string;
  error?: string;
};

async function requestToken(): Promise<string> {
  const deviceRes = await fetch(`${BASE}/api/agent-auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_name: "goyondo-oss",
      requested_scopes: ["trips:read", "trips:write"],
    }),
  });
  const device = (await deviceRes.json()) as DeviceResponse;
  console.log("Ask the user to open:", device.verification_uri_complete);
  const intervalMs = (device.interval ?? 5) * 1000;
  while (true) {
    const tokenRes = await fetch(`${BASE}/api/agent-auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: device.device_code }),
    });
    const body = (await tokenRes.json()) as TokenBody;
    if (tokenRes.ok && body.access_token) {
      console.log("Store this token now (one-time reveal). Example: GOYONDO_API_KEY in .env");
      return body.access_token;
    }
    if (body.error === "authorization_pending") {
      // Not a failure — keep polling.
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    throw new Error(`Token poll failed (${tokenRes.status}): ${JSON.stringify(body)}`);
  }
}

async function task(token: string, payload: unknown) {
  const res = await fetch(`${BASE}/api/agent/task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) throw new Error("task failed");
}

const token = process.env.GOYONDO_API_KEY?.trim() || (await requestToken());
console.log("=== list_trips ===");
// Empty data array is a valid success (new account with no trips).
await task(token, { capability: "list_trips", arguments: {} });
if (CREATE) {
  console.log("=== create_trip (skip_ai_generation) ===");
  await task(token, {
    capability: "create_trip",
    arguments: {
      destination: "Kyoto",
      start_date: "2026-11-01",
      end_date: "2026-11-03",
      travelers: 1,
      skip_ai_generation: true,
    },
  });
}
