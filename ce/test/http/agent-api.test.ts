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
