import { describe, expect, it } from "vitest";
import { EventStore } from "../../src/db/store.ts";

describe("EventStore", () => {
  it("returns an empty event list for a day with no events", () => {
    const store = new EventStore();
    const trip = store.createTrip({
      name: "Lisbon",
      startDate: "2026-09-14",
      endDate: "2026-09-16",
      place: "Lisbon",
    });
    const day = store.listDays(trip.id)[0];
    expect(store.listDayEvents(trip.id, day.id)).toEqual([]);
    store.close();
  });

  it("persists overlapping events and flags both (AE4)", () => {
    const store = new EventStore();
    const trip = store.createTrip({
      name: "Lisbon",
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      place: "Lisbon",
    });
    const day = store.listDays(trip.id)[0];
    store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Museum",
      start: "2026-09-14T14:00:00",
      end: "2026-09-14T16:00:00",
    });
    store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Transfer",
      kind: "transfer",
      start: "2026-09-14T14:00:00",
      end: "2026-09-14T15:00:00",
    });
    const listed = store.listDayEvents(trip.id, day.id);
    expect(listed).toHaveLength(2);
    expect(listed.every((e) => e.conflict)).toBe(true);
    store.close();
  });

  it("recomputes conflicts after moving an event to another day", () => {
    const store = new EventStore();
    const trip = store.createTrip({
      name: "Lisbon",
      startDate: "2026-09-14",
      endDate: "2026-09-15",
      place: "Lisbon",
    });
    const [day1, day2] = store.listDays(trip.id);
    const museum = store.createEvent({
      tripId: trip.id,
      dayId: day1.id,
      title: "Museum",
      start: "2026-09-14T14:00:00",
      end: "2026-09-14T16:00:00",
    });
    store.createEvent({
      tripId: trip.id,
      dayId: day1.id,
      title: "Transfer",
      kind: "transfer",
      start: "2026-09-14T14:00:00",
      end: "2026-09-14T15:00:00",
    });
    store.moveEvent(museum.id, {
      dayId: day2.id,
      start: "2026-09-15T14:00:00",
      end: "2026-09-15T16:00:00",
    });
    expect(store.listDayEvents(trip.id, day1.id).every((e) => !e.conflict)).toBe(true);
    expect(store.listDayEvents(trip.id, day2.id)[0]?.dayId).toBe(day2.id);
    expect(store.listDayEvents(trip.id, day2.id)[0]?.conflict).toBe(false);
    store.close();
  });

  it("clears conflict when the overlapping event is canceled", () => {
    const store = new EventStore();
    const trip = store.createTrip({
      name: "Lisbon",
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      place: "Lisbon",
    });
    const day = store.listDays(trip.id)[0];
    const museum = store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Museum",
      start: "2026-09-14T14:00:00",
      end: "2026-09-14T16:00:00",
    });
    store.createEvent({
      tripId: trip.id,
      dayId: day.id,
      title: "Transfer",
      kind: "transfer",
      start: "2026-09-14T14:00:00",
      end: "2026-09-14T15:00:00",
    });
    store.cancelEvent(museum.id);
    const remaining = store.listDayEvents(trip.id, day.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.title).toBe("Transfer");
    expect(remaining[0]?.conflict).toBe(false);
    store.close();
  });
});
