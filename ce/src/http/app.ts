import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { EventStore } from "../db/store.ts";
import type { AuthService } from "./auth.ts";
import type { AppKeys } from "./keys.ts";
import { CAPABILITIES } from "../agent/capabilities.ts";
import { fetchWeather, type WeatherFetcher } from "../weather/adapter.ts";
import type { LlmClient } from "../llm/adapter.ts";
import { IngestService } from "../ingest/service.ts";
import type { EventKind } from "../domain/types.ts";
import { renderDayPage, renderGatePage } from "../web/pages.ts";

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "../agent/schema.md");

export type CreateAppOpts = {
  store: EventStore;
  auth: AuthService;
  keys: AppKeys;
  ingest: IngestService;
  llm?: LlmClient;
  weatherFetch?: WeatherFetcher;
  secureCookies?: boolean;
};

export function createApp(opts: CreateAppOpts) {
  const app = new Hono();
  const schemaText = readFileSync(SCHEMA_PATH, "utf8");

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/", (c) => {
    if (!opts.auth.hasOperator()) {
      return c.html(renderGatePage({ mode: "register" }));
    }
    const session = getCookie(c, "ce_session");
    if (!opts.auth.operatorFromSession(session)) {
      return c.html(renderGatePage({ mode: "login" }));
    }
    return c.redirect("/today");
  });

  app.post("/register", async (c) => {
    const body = await c.req.parseBody();
    const result = opts.auth.register(String(body.username ?? ""), String(body.password ?? ""));
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    const session = opts.auth.login(String(body.username), String(body.password));
    if (session) {
      setSession(c, session, opts.secureCookies);
    }
    return c.redirect("/today");
  });

  app.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const session = opts.auth.login(String(body.username ?? ""), String(body.password ?? ""));
    if (!session) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    setSession(c, session, opts.secureCookies);
    return c.redirect("/today");
  });

  app.post("/agent-token", (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const token = opts.auth.mintAgentToken();
    return c.json({ token, note: "one-time reveal; store it now" });
  });

  app.post("/api/ui/trips", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.json<{ name: string; startDate: string; endDate: string; place: string }>();
    const trip = opts.store.createTrip(body);
    return c.json({ trip, days: opts.store.listDays(trip.id) });
  });

  app.get("/today", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const view = await buildTodayView(opts);
    return c.html(renderDayPage(view));
  });

  app.get("/api/ui/today", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    return c.json(await buildTodayView(opts));
  });

  app.post("/api/ui/events", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.json<{
      tripId: string;
      dayId: string;
      title: string;
      kind?: EventKind;
      start: string;
      end: string;
    }>();
    const event = opts.store.createEvent(body);
    return c.json({ event, day: opts.store.listDayEvents(body.tripId, body.dayId) });
  });

  app.post("/api/ui/events/:id/move", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.json<{ dayId?: string; start?: string; end?: string }>();
    const event = opts.store.moveEvent(c.req.param("id"), body);
    return c.json({ event, day: opts.store.listDayEvents(event.tripId, event.dayId) });
  });

  app.post("/api/ui/events/:id/cancel", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const event = opts.store.cancelEvent(c.req.param("id"));
    return c.json({ event, day: opts.store.listDayEvents(event.tripId, event.dayId) });
  });

  app.post("/api/ui/documents", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.json<{
      tripId: string;
      filename: string;
      text?: string;
      instruction?: string;
    }>();
    const doc = opts.ingest.attach(body);
    return c.json(doc);
  });

  app.post("/api/ui/proposals", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.json<{ tripId: string }>();
    const proposal = await opts.ingest.propose(body.tripId, opts.llm);
    return c.json(proposal);
  });

  app.post("/api/ui/proposals/:id/confirm", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    return c.json(opts.ingest.confirm(c.req.param("id")));
  });

  app.post("/api/ui/proposals/:id/reject", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    return c.json(opts.ingest.reject(c.req.param("id")));
  });

  app.get("/api/agent/capabilities", (c) => {
    if (!bearerOk(c, opts)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return c.json({ capabilities: CAPABILITIES });
  });

  app.get("/api/agent/schema", (c) => {
    if (!bearerOk(c, opts)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return c.text(schemaText);
  });

  app.post("/api/agent/task", async (c) => {
    if (!bearerOk(c, opts)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const raw = await c.req.json<Record<string, unknown>>();
    if (raw.body && typeof raw.body === "object") {
      return c.json({ error: "nested_arguments_not_allowed" }, 400);
    }
    const capability = String(raw.capability ?? "");
    const args = (raw.arguments ?? {}) as Record<string, string>;
    if (!capability || raw.arguments === undefined) {
      return c.json({ error: "capability_and_arguments_required" }, 400);
    }
    try {
      const result = await runCapability(capability, args, opts);
      return c.json({ ok: true, result });
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  return app;
}

function setSession(c: Context, session: string, secure?: boolean) {
  setCookie(c, "ce_session", session, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: Boolean(secure),
  });
}

function requireOperator(c: Context, opts: CreateAppOpts) {
  const session = getCookie(c, "ce_session");
  if (!opts.auth.operatorFromSession(session)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return undefined;
}

function bearerOk(c: { req: { header: (n: string) => string | undefined } }, opts: CreateAppOpts): boolean {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  return opts.auth.authenticateBearer(token);
}

async function buildTodayView(opts: CreateAppOpts) {
  const trips = opts.store.listTrips();
  if (trips.length === 0) {
    return { state: "pick_trip" as const, trips, message: "Create a trip to see today." };
  }
  const trip = trips[0]!;
  const today = new Date().toISOString().slice(0, 10);
  const days = opts.store.listDays(trip.id);
  const inRange = trip.startDate <= today && today <= trip.endDate;
  const day = inRange ? days.find((d) => d.date === today) ?? days[0] : days[0];
  if (!day) {
    return { state: "pick_day" as const, trip, days, events: [], weather: { status: "unavailable" as const } };
  }
  const events = opts.store.listDayEvents(trip.id, day.id);
  const weather = await fetchWeather({
    apiKey: opts.keys.weatherApiKey,
    place: trip.place,
    fetchImpl: opts.weatherFetch,
  });
  return { state: inRange ? ("today" as const) : ("pick_day" as const), trip, day, days, events, weather };
}

async function runCapability(name: string, args: Record<string, string>, opts: CreateAppOpts) {
  switch (name) {
    case "list_trips":
      return opts.store.listTrips();
    case "get_day": {
      const events = opts.store.listDayEvents(args.trip_id, args.day_id);
      const trip = opts.store.getTrip(args.trip_id);
      const weather = trip
        ? await fetchWeather({
            apiKey: opts.keys.weatherApiKey,
            place: trip.place,
            fetchImpl: opts.weatherFetch,
          })
        : { status: "unavailable" as const };
      return { events, weather };
    }
    case "create_event": {
      const event = opts.store.createEvent({
        tripId: args.trip_id,
        dayId: args.day_id,
        title: args.title,
        kind: (args.kind as EventKind) || "activity",
        start: args.start,
        end: args.end,
        notes: args.notes,
      });
      return { event, day: opts.store.listDayEvents(event.tripId, event.dayId) };
    }
    case "move_event": {
      const event = opts.store.moveEvent(args.event_id, {
        dayId: args.day_id,
        start: args.start,
        end: args.end,
      });
      return { event, day: opts.store.listDayEvents(event.tripId, event.dayId) };
    }
    case "cancel_event": {
      const event = opts.store.cancelEvent(args.event_id);
      return { event, day: opts.store.listDayEvents(event.tripId, event.dayId) };
    }
    case "attach_document":
      return opts.ingest.attach({
        tripId: args.trip_id,
        filename: args.filename || "note.txt",
        text: args.text,
        instruction: args.instruction,
      });
    case "propose_from_documents":
      return opts.ingest.propose(args.trip_id, opts.llm);
    case "confirm_proposal":
      return opts.ingest.confirm(args.proposal_id);
    case "reject_proposal":
      return opts.ingest.reject(args.proposal_id);
    default:
      throw new Error(`unknown_capability:${name}`);
  }
}
