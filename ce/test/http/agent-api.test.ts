import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "../../src/agent/capabilities.ts";
import { cookieHeader, makeHarness, operatorSession } from "./harness.ts";

describe("agent API", () => {
  it("rejects nested arguments and unknown tokens", async () => {
    const { app, auth } = makeHarness();
    await operatorSession(app);
    const token = auth.mintAgentToken();
    const nested = await app.request("/api/agent/task", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ body: { arguments: {} }, capability: "list_trips" }),
    });
    expect(nested.status).toBe(400);
    const unauth = await app.request("/api/agent/task", {
      method: "POST",
      headers: { authorization: "Bearer nope", "content-type": "application/json" },
      body: JSON.stringify({ capability: "list_trips", arguments: {} }),
    });
    expect(unauth.status).toBe(401);
  });

  it("identifies itself as Community Edition before auth", async () => {
    const { app } = makeHarness();
    const res = await app.request("/api/agent/card");
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.edition).toBe("community");
    expect(card.hosted).toBe(false);
    expect(card.name).not.toBe("Goyondo");
    expect(card.first_run.first_capability).toBe("list_trips");
    expect(card.first_run.empty_list_is_success).toBe(true);
  });

  it("explains hosted capabilities, argument names, and gyd_ keys instead of failing opaquely", async () => {
    const { app, auth } = makeHarness();
    await operatorSession(app);
    const token = auth.mintAgentToken();
    const task = (body: unknown, bearer = token) =>
      app.request("/api/agent/task", {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const hostedCap = await task({ capability: "add_activity", arguments: { title: "Dinner" } });
    expect(hostedCap.status).toBe(400);
    const capBody = await hostedCap.json();
    expect(capBody.error.code).toBe("hosted_capability_not_available");
    expect(capBody.error.message).toContain("create_event");

    const hostedArg = await task({ capability: "get_day", arguments: { trip_id: "t", itinerary_id: "d" } });
    expect(hostedArg.status).toBe(400);
    const argBody = await hostedArg.json();
    expect(argBody.error.code).toBe("hosted_argument_names");
    expect(argBody.use_instead).toEqual({ itinerary_id: "day_id" });

    const hostedKey = await task({ capability: "list_trips", arguments: {} }, "gyd_abc");
    expect(hostedKey.status).toBe(401);
    expect((await hostedKey.json()).error.message).toContain("goyondo.run");

    const shared = await task({ capability: "list_trips", arguments: {} });
    expect(shared.status).toBe(200);
  });

  it("does not list hosted group or billing tools", async () => {
    const names = CAPABILITIES.map((c) => c.name);
    expect(names.join(" ")).not.toMatch(/group|billing|quota|harmony/i);
  });

  it("cancels an event so the day view no longer shows it (AE6)", async () => {
    const { app, store, auth } = makeHarness();
    const cookie = cookieHeader(await operatorSession(app));
    const token = auth.mintAgentToken();
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const day = store.listDays(trip.id)[0]!;
    const dinner = store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Dinner",
      kind: "meal",
      start: `${today}T19:00:00`,
      end: `${today}T21:00:00`,
    });
    const cancel = await app.request("/api/agent/task", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "cancel_event", arguments: { event_id: dinner.id } }),
    });
    expect(cancel.status).toBe(200);
    const todayView = await (await app.request("/api/ui/today", { headers: { cookie } })).json();
    expect(todayView.events.find((e: { title: string }) => e.title === "Dinner")).toBeUndefined();
  });

  it("returns conflict flags on get_day (AE4) and new time after UI move (AE3)", async () => {
    const { app, store, auth } = makeHarness();
    await operatorSession(app);
    const token = auth.mintAgentToken();
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const day = store.listDays(trip.id)[0]!;
    const museum = store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Museum",
      start: `${today}T14:00:00`,
      end: `${today}T16:00:00`,
    });
    store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Transfer",
      kind: "transfer",
      start: `${today}T14:00:00`,
      end: `${today}T15:00:00`,
    });
    const dayRes = await app.request("/api/agent/task", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        capability: "get_day",
        arguments: { trip_id: trip.id, day_id: day.id },
      }),
    });
    const dayBody = await dayRes.json();
    expect(dayBody.result.events.every((e: { conflict: boolean }) => e.conflict)).toBe(true);
    store.moveEvent(museum.id, { start: `${today}T16:00:00`, end: `${today}T18:00:00` });
    const moved = await app.request("/api/agent/task", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        capability: "get_day",
        arguments: { trip_id: trip.id, day_id: day.id },
      }),
    });
    const listed = (await moved.json()).result.events as { id: string; start: string }[];
    expect(listed.find((e) => e.id === museum.id)?.start).toContain("T16:00:00");
  });

  it("serves capabilities and schema without a token", async () => {
    const { app } = makeHarness();
    const caps = await app.request("/api/agent/capabilities");
    const schema = await app.request("/api/agent/schema");
    expect(caps.status).toBe(200);
    expect(await schema.text()).toContain("CE-native");
  });

  it("creates a solo trip, fills events once, and reports local warnings", async () => {
    const { app, auth, store } = makeHarness();
    await operatorSession(app);
    const token = auth.mintAgentToken();
    const task = (body: unknown) =>
      app.request("/api/agent/task", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const hostedTrip = await task({
      capability: "create_trip",
      arguments: { destination: "Lisbon", start_date: "2026-11-01", end_date: "2026-11-02" },
    });
    expect((await hostedTrip.json()).error.code).toBe("hosted_argument_names");

    const created = await task({
      capability: "create_trip",
      arguments: { name: "Lisbon", place: "Lisbon", start_date: "2026-11-01", end_date: "2026-11-02" },
    });
    const createdBody = await created.json();
    expect(created.status).toBe(200);
    const tripId = createdBody.result.trip.id as string;
    const [day1, day2] = createdBody.result.days as { id: string }[];

    const missing = await task({
      capability: "nope",
      arguments: {},
    });
    expect(missing.status).toBe(404);
    expect((await missing.json()).available_capabilities).toContain("create_events");

    const invalid = await task({
      capability: "create_events",
      arguments: {
        trip_id: tripId,
        days: [{ day_id: "missing", events: [{ title: "Walk", start: "2026-11-01T09:00:00", end: "2026-11-01T10:00:00" }] }],
      },
    });
    expect(invalid.status).toBe(400);
    expect(store.listEvents(tripId)).toHaveLength(0);

    const batch = await task({
      capability: "create_events",
      arguments: {
        trip_id: tripId,
        days: [
          {
            day_id: day1.id,
            events: [
              { title: "Museum", start: "2026-11-01T14:00:00", end: "2026-11-01T16:00:00" },
              { title: "Museum", kind: "activity", start: "2026-11-01T14:30:00", end: "2026-11-01T15:30:00" },
            ],
          },
          {
            day_id: day2.id,
            events: [{ title: "Museum", start: "2026-11-02T10:00:00", end: "2026-11-02T12:00:00" }],
          },
        ],
      },
    });
    const batchBody = await batch.json();
    expect(batch.status).toBe(200);
    expect(batchBody.result.events).toHaveLength(3);
    expect(batchBody.result.warnings.map((warning: { type: string }) => warning.type)).toEqual(
      expect.arrayContaining(["duplicate_event", "time_overlap", "repeated_event"]),
    );

    const notes = await task({
      capability: "update_day_notes",
      arguments: { trip_id: tripId, day_id: day1.id, notes: "Rain in the afternoon" },
    });
    expect((await notes.json()).result.day.notes).toBe("Rain in the afternoon");

    const attached = await task({
      capability: "attach_document",
      arguments: { trip_id: tripId, filename: "hotel.txt", text: "Check in at 15:00" },
    });
    const documentId = (await attached.json()).result.id as string;
    const doc = await task({
      capability: "get_document",
      arguments: { trip_id: tripId, document_id: documentId },
    });
    expect((await doc.json()).result.documents[0].extractedText).toContain("15:00");

    const listed = await task({ capability: "list_trips", arguments: { limit: 1 } });
    const listedBody = await listed.json();
    expect(listedBody.result.trips).toHaveLength(1);
    expect(listedBody.result.has_more).toBe(false);

    const plan = await task({ capability: "get_plan_warnings", arguments: { trip_id: tripId } });
    expect((await plan.json()).result.warnings.length).toBeGreaterThan(0);
    const days = await task({ capability: "list_days", arguments: { trip_id: tripId } });
    expect((await days.json()).result.days).toHaveLength(2);
    const events = await task({ capability: "list_events", arguments: { trip_id: tripId } });
    expect((await events.json()).result.events).toHaveLength(3);
  });
});
