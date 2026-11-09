import type { Event, EventWithConflicts } from "./types.ts";

function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid event time: ${iso}`);
  }
  return ms;
}

function overlaps(a: Event, b: Event): boolean {
  const aStart = toMs(a.start);
  const aEnd = toMs(a.end);
  const bStart = toMs(b.start);
  const bEnd = toMs(b.end);
  return aStart < bEnd && bStart < aEnd;
}

export function flagConflicts(events: Event[]): EventWithConflicts[] {
  return events.map((event) => {
    if (event.status === "canceled") {
      return { ...event, conflict: false };
    }
    const conflict = events.some(
      (other) =>
        other.id !== event.id &&
        other.status !== "canceled" &&
        other.dayId === event.dayId &&
        overlaps(event, other),
    );
    return { ...event, conflict };
  });
}
