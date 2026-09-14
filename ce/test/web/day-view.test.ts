import { describe, expect, it } from "vitest";
import { cookieHeader, makeHarness, operatorSession } from "../http/harness.ts";

describe("day view", () => {
  it("shows today's events and weather when keyed (AE1)", async () => {
    const { app, store } = makeHarness({
      keys: {
        weatherApiKey: "wx",
        llmApiKey: "",
        llmBaseUrl: "https://api.openai.com/v1",
        llmModel: "gpt-4o-mini",
        sessionSecret: "s",
      },
      weatherFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ weather: [{ description: "sun" }], main: { temp: 18 } }),
      }),
    });
    const cookie = cookieHeader(await operatorSession(app));
    const today = new Date().toISOString().slice(0, 10);
    store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const res = await app.request("/api/ui/today", { headers: { cookie } });
    const body = await res.json();
    expect(body.state).toBe("today");
    expect(body.weather.status).toBe("ok");
    expect(body.weather.summary).toBe("sun");
    const html = await (await app.request("/today", { headers: { cookie } })).text();
    expect(html).toContain("data-weather");
    expect(html).toContain("data-events");
  });

  it("keeps events when weather key is missing (AE2)", async () => {
    const { app, store } = makeHarness();
    const cookie = cookieHeader(await operatorSession(app));
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const day = store.listDays(trip.id)[0]!;
    store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Lunch",
      start: `${today}T12:00:00`,
      end: `${today}T13:00:00`,
    });
    const body = await (await app.request("/api/ui/today", { headers: { cookie } })).json();
    expect(body.events[0].title).toBe("Lunch");
    expect(body.weather.status).toBe("unavailable");
  });

  it("moves an event without an LLM key (AE3)", async () => {
    const { app, store } = makeHarness();
    const cookie = cookieHeader(await operatorSession(app));
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const day = store.listDays(trip.id)[0]!;
    const lunch = store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Lunch",
      start: `${today}T12:00:00`,
      end: `${today}T13:00:00`,
    });
    const res = await app.request(`/api/ui/events/${lunch.id}/move`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ start: `${today}T14:00:00`, end: `${today}T15:00:00` }),
    });
    const body = await res.json();
    expect(body.event.start).toContain("T14:00:00");
    expect(store.getEvent(lunch.id)?.start).toContain("T14:00:00");
  });
});
