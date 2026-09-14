import { describe, expect, it } from "vitest";
import { flagConflicts } from "../../src/domain/conflicts.ts";
import type { Event } from "../../src/domain/types.ts";

function ev(partial: Partial<Event> & Pick<Event, "id" | "start" | "end">): Event {
  return {
    tripId: "trip-1",
    dayId: "day-1",
    title: "item",
    kind: "activity",
    status: "active",
    ...partial,
  };
}

describe("flagConflicts", () => {
  it("returns an empty list for an empty day", () => {
    expect(flagConflicts([])).toEqual([]);
  });

  it("does not flag non-overlapping events", () => {
    const events = [
      ev({ id: "a", title: "Breakfast", start: "2026-09-14T08:00:00", end: "2026-09-14T09:00:00" }),
      ev({ id: "b", title: "Museum", start: "2026-09-14T10:00:00", end: "2026-09-14T12:00:00" }),
    ];
    expect(flagConflicts(events).every((e) => !e.conflict)).toBe(true);
  });

  it("flags both events that start at the same time (AE4)", () => {
    const events = [
      ev({ id: "museum", title: "Museum", start: "2026-09-14T14:00:00", end: "2026-09-14T16:00:00" }),
      ev({ id: "transfer", title: "Transfer", start: "2026-09-14T14:00:00", end: "2026-09-14T15:00:00" }),
    ];
    const flagged = flagConflicts(events);
    expect(flagged).toHaveLength(2);
    expect(flagged.every((e) => e.conflict)).toBe(true);
    expect(flagged.map((e) => e.id).sort()).toEqual(["museum", "transfer"]);
  });

  it("does not treat a canceled overlapping event as a conflict", () => {
    const events = [
      ev({ id: "a", start: "2026-09-14T14:00:00", end: "2026-09-14T16:00:00" }),
      ev({
        id: "b",
        start: "2026-09-14T14:00:00",
        end: "2026-09-14T15:00:00",
        status: "canceled",
      }),
    ];
    const flagged = flagConflicts(events);
    expect(flagged.find((e) => e.id === "a")?.conflict).toBe(false);
    expect(flagged.find((e) => e.id === "b")?.conflict).toBe(false);
  });

  it("treats adjacent [start, end) ranges as non-overlapping", () => {
    const events = [
      ev({ id: "a", start: "2026-09-14T14:00:00", end: "2026-09-14T15:00:00" }),
      ev({ id: "b", start: "2026-09-14T15:00:00", end: "2026-09-14T16:00:00" }),
    ];
    expect(flagConflicts(events).every((e) => !e.conflict)).toBe(true);
  });
});
