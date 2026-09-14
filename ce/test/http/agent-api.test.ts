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
    expect(capBody.error).toBe("hosted_capability_not_available");
    expect(capBody.message).toContain("create_event");

    const hostedArg = await task({ capability: "get_day", arguments: { trip_id: "t", itinerary_id: "d" } });
    expect(hostedArg.status).toBe(400);
    const argBody = await hostedArg.json();
    expect(argBody.error).toBe("hosted_argument_names");
    expect(argBody.use_instead).toEqual({ itinerary_id: "day_id" });

    const hostedKey = await task({ capability: "list_trips", arguments: {} }, "gyd_abc");
    expect(hostedKey.status).toBe(401);
    expect((await hostedKey.json()).message).toContain("goyondo.run");

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

  it("serves capabilities and schema to a bearer token", async () => {
    const { app, auth } = makeHarness();
    await operatorSession(app);
    const token = auth.mintAgentToken();
    const caps = await app.request("/api/agent/capabilities", {
      headers: { authorization: `Bearer ${token}` },
    });
    const schema = await app.request("/api/agent/schema", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(caps.status).toBe(200);
    expect(await schema.text()).toContain("CE-native");
  });
});
