import { describe, expect, it } from "vitest";
import { cookieHeader, makeHarness, operatorSession } from "../http/harness.ts";

describe("ingest propose/confirm", () => {
  it("does not apply events until confirm (AE5)", async () => {
    let dayId = "";
    const { app, store, ingest } = makeHarness({
      llm: {
        complete: async () =>
          JSON.stringify({
            events: [
              {
                dayId,
                title: "Hotel Lisboa",
                kind: "hotel",
                start: `${new Date().toISOString().slice(0, 10)}T15:00:00`,
                end: `${new Date().toISOString().slice(0, 10)}T16:00:00`,
              },
            ],
          }),
      },
    });
    const cookie = cookieHeader(await operatorSession(app));
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const day = store.listDays(trip.id)[0]!;
    dayId = day.id;
    await app.request("/api/ui/documents", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        tripId: trip.id,
        filename: "hotel.pdf",
        text: "Reservation Hotel Lisboa",
        instruction: "add this stay",
      }),
    });
    const propose = await app.request("/api/ui/proposals", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tripId: trip.id }),
    });
    const proposal = await propose.json();
    expect(proposal.status).toBe("proposed");
    expect(store.listDayEvents(trip.id, day.id)).toHaveLength(0);
    expect(ingest.list(trip.id)).toHaveLength(1);
    const confirm = await app.request(`/api/ui/proposals/${proposal.id}/confirm`, {
      method: "POST",
      headers: { cookie },
    });
    expect(confirm.status).toBe(200);
    expect(store.listDayEvents(trip.id, day.id).some((e) => e.title === "Hotel Lisboa")).toBe(true);
  });

  it("keeps the file and writes no events on reject", async () => {
    const { app, store, ingest } = makeHarness({
      llm: {
        complete: async () =>
          JSON.stringify({
            events: [
              {
                dayId: "x",
                title: "Skip me",
                kind: "activity",
                start: "t",
                end: "t2",
              },
            ],
          }),
      },
    });
    const cookie = cookieHeader(await operatorSession(app));
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const day = store.listDays(trip.id)[0]!;
    await app.request("/api/ui/documents", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, filename: "note.txt", text: "hi" }),
    });
    const proposal = await (
      await app.request("/api/ui/proposals", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ tripId: trip.id }),
      })
    ).json();
    await app.request(`/api/ui/proposals/${proposal.id}/reject`, { method: "POST", headers: { cookie } });
    expect(store.listDayEvents(trip.id, day.id)).toHaveLength(0);
    expect(ingest.list(trip.id)).toHaveLength(1);
  });

  it("records failed_parse when the LLM errors", async () => {
    const { app, store } = makeHarness({
      llm: {
        complete: async () => {
          throw new Error("boom");
        },
      },
    });
    const cookie = cookieHeader(await operatorSession(app));
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    await app.request("/api/ui/documents", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, filename: "note.txt", text: "hi" }),
    });
    const proposal = await (
      await app.request("/api/ui/proposals", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ tripId: trip.id }),
      })
    ).json();
    expect(proposal.status).toBe("failed_parse");
    expect(store.listDayEvents(trip.id, store.listDays(trip.id)[0]!.id)).toHaveLength(0);
  });

  it("fails closed without an LLM key", async () => {
    const { app, store } = makeHarness();
    const cookie = cookieHeader(await operatorSession(app));
    const today = new Date().toISOString().slice(0, 10);
    const trip = store.createTrip({ name: "Lisbon", startDate: today, endDate: today, place: "Lisbon" });
    const proposal = await (
      await app.request("/api/ui/proposals", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ tripId: trip.id }),
      })
    ).json();
    expect(proposal.status).toBe("failed_parse");
    expect(proposal.error).toBe("missing_llm_key");
  });
});
