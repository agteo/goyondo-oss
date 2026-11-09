import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { EventStore } from "../db/store.ts";
import type { AuthService } from "./auth.ts";
import type { AppKeys } from "./keys.ts";
import {
  AGENT_CARD,
  CAPABILITIES,
  EDITION,
  HOSTED_ARGUMENTS,
  HOSTED_ONLY_CAPABILITIES,
} from "../agent/capabilities.ts";
import { fetchWeather, type WeatherFetcher } from "../weather/adapter.ts";
import type { LlmClient } from "../llm/adapter.ts";
import { IngestService } from "../ingest/service.ts";
import type { EventKind } from "../domain/types.ts";
import { planWarnings, warningsForEvents, type PlanWarning } from "../domain/warnings.ts";
import { renderDayPage, renderGatePage } from "../web/pages.ts";

const EVENT_KINDS = new Set<EventKind>(["flight", "hotel", "meal", "activity", "transfer", "other"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;
const MAX_EVENTS_PER_DAY = 20;
const MAX_EVENTS_PER_CALL = 150;

class TaskError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

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
    const view = await buildTodayView(opts, c.req.query());
    return c.html(renderDayPage(view));
  });

  app.get("/api/ui/today", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    return c.json(await buildTodayView(opts, c.req.query()));
  });

  app.post("/today/trips", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.parseBody();
    try {
      const trip = opts.store.createTrip(readTripFields(body));
      return c.redirect(`/today?trip=${trip.id}`);
    } catch (err) {
      const view = await buildTodayView(opts);
      return c.html(renderDayPage({ ...view, message: errorMessage(err) }), 400);
    }
  });

  app.post("/today/events", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.parseBody();
    const tripId = String(body.tripId ?? "");
    const dayId = String(body.dayId ?? "");
    const start = String(body.start ?? "");
    const end = String(body.end ?? "");
    try {
      if (!String(body.title ?? "").trim() || Number.isNaN(Date.parse(start)) || Date.parse(end) <= Date.parse(start)) {
        throw new TaskError("validation_failed", "Give a title and an end time after the start.");
      }
      opts.store.createEvent({
        tripId,
        dayId,
        title: String(body.title ?? "").trim(),
        kind: readKind(body.kind),
        start,
        end,
      });
      return c.redirect(`/today?trip=${tripId}&day=${dayId}`);
    } catch (err) {
      const view = await buildTodayView(opts, { trip: tripId, day: dayId });
      return c.html(renderDayPage({ ...view, message: errorMessage(err) }), 400);
    }
  });

  app.post("/today/events/:id/move", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.parseBody();
    const event = opts.store.moveEvent(c.req.param("id"), {
      start: String(body.start ?? "") || undefined,
      end: String(body.end ?? "") || undefined,
    });
    return c.redirect(`/today?trip=${event.tripId}&day=${event.dayId}`);
  });

  app.post("/today/events/:id/cancel", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const event = opts.store.cancelEvent(c.req.param("id"));
    return c.redirect(`/today?trip=${event.tripId}&day=${event.dayId}`);
  });

  app.post("/today/notes", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.parseBody();
    const tripId = String(body.tripId ?? "");
    const dayId = String(body.dayId ?? "");
    opts.store.updateDayNotes(tripId, dayId, String(body.notes ?? ""));
    return c.redirect(`/today?trip=${tripId}&day=${dayId}`);
  });

  app.post("/today/documents", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.parseBody();
    const tripId = String(body.tripId ?? "");
    opts.ingest.attach({
      tripId,
      filename: String(body.filename ?? "note.txt"),
      text: String(body.text ?? ""),
      instruction: String(body.instruction ?? ""),
    });
    return c.redirect(`/today?trip=${tripId}`);
  });

  app.post("/today/agent-token", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const token = opts.auth.mintAgentToken();
    const view = await buildTodayView(opts, c.req.query());
    return c.html(renderDayPage({ ...view, agentToken: token }));
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
    return c.json({
      event,
      day: opts.store.listDayEvents(body.tripId, body.dayId),
      warnings: warningsForEvents(tripPlanWarnings(opts, body.tripId), [event.id]),
    });
  });

  app.post("/api/ui/events/:id/move", async (c) => {
    const denied = requireOperator(c, opts);
    if (denied) {
      return denied;
    }
    const body = await c.req.json<{ dayId?: string; start?: string; end?: string }>();
    const event = opts.store.moveEvent(c.req.param("id"), body);
    return c.json({
      event,
      day: opts.store.listDayEvents(event.tripId, event.dayId),
      warnings: warningsForEvents(tripPlanWarnings(opts, event.tripId), [event.id]),
    });
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

  // Public so an agent can tell which Goyondo it is talking to before auth.
  app.get("/api/agent/card", (c) => c.json(AGENT_CARD));

  app.get("/api/agent/capabilities", (c) => c.json({ edition: EDITION, capabilities: CAPABILITIES }));

  app.get("/api/agent/schema", (c) => c.text(schemaText));

  app.post("/api/agent/task", async (c) => {
    if (!bearerOk(c, opts)) {
      return unauthorized(c);
    }
    const raw = await c.req.json<Record<string, unknown>>();
    if (raw.body && typeof raw.body === "object") {
      return taskError(c, new TaskError("nested_arguments_not_allowed", "Pass flat arguments. Do not nest them under body."));
    }
    const capability = String(raw.capability ?? "");
    const args = (raw.arguments ?? {}) as Record<string, unknown>;
    if (!capability || raw.arguments === undefined) {
      return taskError(c, new TaskError("capability_and_arguments_required", "capability and arguments are required."));
    }
    const hostedCapability = HOSTED_ONLY_CAPABILITIES[capability];
    if (hostedCapability) {
      return taskError(
        c,
        new TaskError(
          "hosted_capability_not_available",
          `${capability} is a goyondo.run capability. This is Community Edition. ${hostedCapability}`,
          400,
          { edition: EDITION, capability_registry_url: AGENT_CARD.capability_registry_url },
        ),
      );
    }
    const hostedArgs = Object.keys(args).filter((key) => key in HOSTED_ARGUMENTS);
    if (hostedArgs.length > 0) {
      return taskError(
        c,
        new TaskError(
          "hosted_argument_names",
          "These are goyondo.run argument names. This is Community Edition.",
          400,
          {
            edition: EDITION,
            use_instead: Object.fromEntries(hostedArgs.map((key) => [key, HOSTED_ARGUMENTS[key]])),
            schema_url: AGENT_CARD.schema_url,
          },
        ),
      );
    }
    try {
      const result = await runCapability(capability, args, opts);
      return c.json({ ok: true, result });
    } catch (err) {
      if (err instanceof TaskError) {
        return taskError(c, err);
      }
      const message = errorMessage(err);
      if (message.startsWith("unknown_capability:")) {
        const available = CAPABILITIES.map((item) => item.name);
        return taskError(
          c,
          new TaskError("capability_not_found", `Capability '${capability}' not found.`, 404, {
            available_capabilities: available,
          }),
        );
      }
      return taskError(c, new TaskError("validation_failed", message));
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

function unauthorized(c: Context) {
  const header = c.req.header("authorization") ?? "";
  if (header.startsWith("Bearer gyd_")) {
    return c.json(
      {
        error: {
          code: "unauthorized",
          message: "gyd_ keys belong to goyondo.run. This Community Edition instance uses gce_ tokens.",
        },
        edition: EDITION,
        card_url: "/api/agent/card",
      },
      401,
    );
  }
  return c.json({ error: { code: "unauthorized", message: "unauthorized" } }, 401);
}

function taskError(c: Context, err: TaskError) {
  return c.json({ error: { code: err.code, message: err.message }, ...(err.details ?? {}) }, err.status);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function bearerOk(c: { req: { header: (n: string) => string | undefined } }, opts: CreateAppOpts): boolean {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  return opts.auth.authenticateBearer(token);
}

async function buildTodayView(opts: CreateAppOpts, query: { trip?: string; day?: string } = {}) {
  const trips = opts.store.listTrips();
  if (trips.length === 0) {
    return { state: "pick_trip" as const, trips, events: [], warnings: [] as PlanWarning[], message: "Create a trip to see today." };
  }
  const trip = trips.find((item) => item.id === query.trip) ?? trips[0]!;
  const today = new Date().toISOString().slice(0, 10);
  const days = opts.store.listDays(trip.id);
  const inRange = trip.startDate <= today && today <= trip.endDate;
  const day =
    days.find((item) => item.id === query.day) ??
    (inRange ? days.find((item) => item.date === today) : undefined) ??
    days[0];
  if (!day) {
    return {
      state: "pick_day" as const,
      trip,
      trips,
      days,
      events: [],
      warnings: [] as PlanWarning[],
      weather: { status: "unavailable" as const },
    };
  }
  const events = opts.store.listDayEvents(trip.id, day.id);
  const warnings = tripPlanWarnings(opts, trip.id).filter(
    (warning) => warning.day_id === day.id || warning.affected_event_ids.some((id) => events.some((event) => event.id === id)),
  );
  const weather = await fetchWeather({
    apiKey: opts.keys.weatherApiKey,
    place: trip.place,
    fetchImpl: opts.weatherFetch,
  });
  return {
    state: day.date === today && inRange ? ("today" as const) : ("pick_day" as const),
    trip,
    trips,
    day,
    days,
    events,
    warnings,
    weather,
  };
}

function tripPlanWarnings(opts: CreateAppOpts, tripId: string): PlanWarning[] {
  return planWarnings(
    opts.store.listDays(tripId).map((day) => ({
      id: day.id,
      date: day.date,
      events: opts.store.listDayEvents(tripId, day.id),
    })),
  );
}

async function runCapability(name: string, args: Record<string, unknown>, opts: CreateAppOpts) {
  switch (name) {
    case "list_trips": {
      const page = opts.store.listTripsPage(optionalLimit(args.limit));
      return { trips: page.trips, has_more: page.hasMore };
    }
    case "create_trip": {
      const startDate = requiredDate(args, "start_date");
      const endDate = requiredDate(args, "end_date");
      if (endDate < startDate) {
        throw new TaskError("validation_failed", "end_date must be on or after start_date.");
      }
      const trip = opts.store.createTrip({
        name: requiredString(args, "name"),
        startDate,
        endDate,
        place: requiredString(args, "place"),
      });
      return { trip, days: opts.store.listDays(trip.id) };
    }
    case "list_days": {
      const tripId = requiredString(args, "trip_id");
      requireTrip(opts, tripId);
      return { days: opts.store.listDays(tripId) };
    }
    case "get_day": {
      const tripId = requiredString(args, "trip_id");
      const dayId = requiredString(args, "day_id");
      const trip = requireTrip(opts, tripId);
      const events = opts.store.listDayEvents(tripId, dayId);
      const weather = await fetchWeather({
        apiKey: opts.keys.weatherApiKey,
        place: trip.place,
        fetchImpl: opts.weatherFetch,
      });
      return {
        events,
        weather,
        warnings: tripPlanWarnings(opts, tripId).filter(
          (warning) =>
            warning.day_id === dayId || warning.affected_event_ids.some((id) => events.some((event) => event.id === id)),
        ),
      };
    }
    case "list_events": {
      const tripId = requiredString(args, "trip_id");
      requireTrip(opts, tripId);
      return { events: opts.store.listEvents(tripId) };
    }
    case "create_event": {
      const event = opts.store.createEvent(readEventInput(args, requiredString(args, "trip_id"), requiredString(args, "day_id")));
      return {
        event,
        day: opts.store.listDayEvents(event.tripId, event.dayId),
        warnings: warningsForEvents(tripPlanWarnings(opts, event.tripId), [event.id]),
      };
    }
    case "create_events": {
      const tripId = requiredString(args, "trip_id");
      requireTrip(opts, tripId);
      const batches = readEventBatches(opts, tripId, args.days);
      const events = opts.store.createEvents(batches);
      return {
        events,
        warnings: warningsForEvents(
          tripPlanWarnings(opts, tripId),
          events.map((event) => event.id),
        ),
      };
    }
    case "move_event": {
      const event = opts.store.moveEvent(requiredString(args, "event_id"), {
        dayId: optionalString(args, "day_id"),
        start: optionalString(args, "start"),
        end: optionalString(args, "end"),
      });
      return {
        event,
        day: opts.store.listDayEvents(event.tripId, event.dayId),
        warnings: warningsForEvents(tripPlanWarnings(opts, event.tripId), [event.id]),
      };
    }
    case "cancel_event": {
      const event = opts.store.cancelEvent(requiredString(args, "event_id"));
      return { event, day: opts.store.listDayEvents(event.tripId, event.dayId) };
    }
    case "get_plan_warnings": {
      const tripId = requiredString(args, "trip_id");
      requireTrip(opts, tripId);
      return { warnings: tripPlanWarnings(opts, tripId) };
    }
    case "update_day_notes": {
      const tripId = requiredString(args, "trip_id");
      const dayId = requiredString(args, "day_id");
      requireTrip(opts, tripId);
      if (typeof args.notes !== "string") {
        throw new TaskError("validation_failed", "notes is required.");
      }
      return { day: opts.store.updateDayNotes(tripId, dayId, args.notes) };
    }
    case "get_document": {
      const tripId = requiredString(args, "trip_id");
      requireTrip(opts, tripId);
      const documentId = optionalString(args, "document_id");
      const name = optionalString(args, "name");
      if (!documentId && !name) {
        throw new TaskError("validation_failed", "document_id or name is required.");
      }
      const documents = opts.ingest.find(tripId, { documentId, name });
      if (documents.length === 0) {
        throw new TaskError("validation_failed", "Document not found.");
      }
      return { documents };
    }
    case "attach_document":
      return opts.ingest.attach({
        tripId: requiredString(args, "trip_id"),
        filename: optionalString(args, "filename") || "note.txt",
        text: optionalString(args, "text"),
        instruction: optionalString(args, "instruction"),
      });
    case "propose_from_documents":
      return opts.ingest.propose(requiredString(args, "trip_id"), opts.llm);
    case "confirm_proposal":
      return opts.ingest.confirm(requiredString(args, "proposal_id"));
    case "reject_proposal":
      return opts.ingest.reject(requiredString(args, "proposal_id"));
    default:
      throw new Error(`unknown_capability:${name}`);
  }
}

function requireTrip(opts: CreateAppOpts, tripId: string) {
  const trip = opts.store.getTrip(tripId);
  if (!trip) {
    throw new TaskError("validation_failed", `Unknown trip: ${tripId}`);
  }
  return trip;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new TaskError("validation_failed", `${key} is required.`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TaskError("validation_failed", `${key} must be a string.`);
  }
  return value;
}

function requiredDate(args: Record<string, unknown>, key: string): string {
  const value = requiredString(args, key);
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new TaskError("validation_failed", `${key} must be YYYY-MM-DD.`);
  }
  return value;
}

function optionalLimit(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const limit = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TaskError("validation_failed", "limit must be an integer from 1 to 100.");
  }
  return limit;
}

function readKind(value: unknown): EventKind {
  if (value === undefined || value === "") {
    return "activity";
  }
  if (typeof value === "string" && EVENT_KINDS.has(value as EventKind)) {
    return value as EventKind;
  }
  throw new TaskError("validation_failed", "kind must be flight, hotel, meal, activity, transfer, or other.");
}

function readEventInput(args: Record<string, unknown>, tripId: string, dayId: string) {
  const start = requiredString(args, "start");
  const end = requiredString(args, "end");
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    throw new TaskError("validation_failed", "start and end must be ISO datetimes.");
  }
  if (Date.parse(end) <= Date.parse(start)) {
    throw new TaskError("validation_failed", "end must be after start.");
  }
  return {
    tripId,
    dayId,
    title: requiredString(args, "title"),
    kind: readKind(args.kind),
    start,
    end,
    notes: optionalString(args, "notes"),
  };
}

function readEventBatches(opts: CreateAppOpts, tripId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TaskError("validation_failed", "days must be a non-empty array.");
  }
  if (value.length > MAX_DAYS) {
    throw new TaskError("validation_failed", `days is limited to ${MAX_DAYS}.`);
  }
  let count = 0;
  const batches = value.map((day) => {
    if (!day || typeof day !== "object" || Array.isArray(day)) {
      throw new TaskError("validation_failed", "each day must be an object.");
    }
    const record = day as Record<string, unknown>;
    const dayId = requiredString(record, "day_id");
    if (!opts.store.getDay(tripId, dayId)) {
      throw new TaskError("validation_failed", `Unknown day: ${dayId}`);
    }
    if (!Array.isArray(record.events) || record.events.length === 0) {
      throw new TaskError("validation_failed", "each day needs a non-empty events array.");
    }
    if (record.events.length > MAX_EVENTS_PER_DAY) {
      throw new TaskError("validation_failed", `a day is limited to ${MAX_EVENTS_PER_DAY} events.`);
    }
    count += record.events.length;
    if (count > MAX_EVENTS_PER_CALL) {
      throw new TaskError("validation_failed", `create_events is limited to ${MAX_EVENTS_PER_CALL} events.`);
    }
    return {
      dayId,
      events: record.events.map((event) => {
        if (!event || typeof event !== "object" || Array.isArray(event)) {
          throw new TaskError("validation_failed", "each event must be an object.");
        }
        return readEventInput(event as Record<string, unknown>, tripId, dayId);
      }),
    };
  });
  return batches;
}

function readTripFields(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const startDate = String(body.startDate ?? body.start_date ?? "").trim();
  const endDate = String(body.endDate ?? body.end_date ?? "").trim();
  const place = String(body.place ?? "").trim();
  if (!name || !place) {
    throw new TaskError("validation_failed", "name and place are required.");
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || endDate < startDate) {
    throw new TaskError("validation_failed", "Use YYYY-MM-DD dates, with the end on or after the start.");
  }
  return { name, startDate, endDate, place };
}
