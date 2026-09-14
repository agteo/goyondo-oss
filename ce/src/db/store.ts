import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { flagConflicts } from "../domain/conflicts.ts";
import type { Day, Event, EventKind, EventStatus, Trip } from "../domain/types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  place TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS days (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  date TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id),
  FOREIGN KEY (day_id) REFERENCES days(id)
);
`;

export type CreateEventInput = {
  tripId: string;
  dayId: string;
  title: string;
  kind?: EventKind;
  start: string;
  end: string;
  notes?: string;
};

export class EventStore {
  readonly db: DatabaseSync;

  constructor(filename = ":memory:") {
    this.db = new DatabaseSync(filename);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  createTrip(input: { name: string; startDate: string; endDate: string; place: string }): Trip {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO trips (id, name, start_date, end_date, place) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, input.name, input.startDate, input.endDate, input.place);
    this.ensureDays(id, input.startDate, input.endDate);
    return { id, ...input };
  }

  getTrip(id: string): Trip | undefined {
    const row = this.db
      .prepare("SELECT id, name, start_date AS startDate, end_date AS endDate, place FROM trips WHERE id = ?")
      .get(id) as Trip | undefined;
    return row;
  }

  listTrips(): Trip[] {
    return this.db
      .prepare("SELECT id, name, start_date AS startDate, end_date AS endDate, place FROM trips")
      .all() as Trip[];
  }

  listDays(tripId: string): Day[] {
    return this.db
      .prepare("SELECT id, trip_id AS tripId, date FROM days WHERE trip_id = ? ORDER BY date")
      .all(tripId) as Day[];
  }

  getDay(tripId: string, dayId: string): Day | undefined {
    return this.db
      .prepare("SELECT id, trip_id AS tripId, date FROM days WHERE trip_id = ? AND id = ?")
      .get(tripId, dayId) as Day | undefined;
  }

  createEvent(input: CreateEventInput): Event {
    const event: Event = {
      id: randomUUID(),
      tripId: input.tripId,
      dayId: input.dayId,
      title: input.title,
      kind: input.kind ?? "activity",
      start: input.start,
      end: input.end,
      status: "active",
      notes: input.notes,
    };
    this.insertEvent(event);
    return event;
  }

  insertEvent(event: Event): void {
    this.db
      .prepare(
        `INSERT INTO events (id, trip_id, day_id, title, kind, start, "end", status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.tripId,
        event.dayId,
        event.title,
        event.kind,
        event.start,
        event.end,
        event.status,
        event.notes ?? null,
      );
  }

  listDayEvents(tripId: string, dayId: string, includeCanceled = false): Event[] {
    const rows = this.db
      .prepare(
        `SELECT id, trip_id AS tripId, day_id AS dayId, title, kind, start, "end" AS "end", status, notes
         FROM events WHERE trip_id = ? AND day_id = ? ORDER BY start`,
      )
      .all(tripId, dayId) as Event[];
    const filtered = includeCanceled ? rows : rows.filter((e) => e.status !== "canceled");
    return flagConflicts(filtered);
  }

  moveEvent(eventId: string, patch: { dayId?: string; start?: string; end?: string }): Event {
    const current = this.getEvent(eventId);
    if (!current) {
      throw new Error(`Unknown event: ${eventId}`);
    }
    const next: Event = {
      ...current,
      dayId: patch.dayId ?? current.dayId,
      start: patch.start ?? current.start,
      end: patch.end ?? current.end,
    };
    this.db
      .prepare(`UPDATE events SET day_id = ?, start = ?, "end" = ? WHERE id = ?`)
      .run(next.dayId, next.start, next.end, eventId);
    return this.getEvent(eventId)!;
  }

  cancelEvent(eventId: string): Event {
    const current = this.getEvent(eventId);
    if (!current) {
      throw new Error(`Unknown event: ${eventId}`);
    }
    this.db.prepare(`UPDATE events SET status = ? WHERE id = ?`).run("canceled" satisfies EventStatus, eventId);
    return this.getEvent(eventId)!;
  }

  getEvent(eventId: string): Event | undefined {
    return this.db
      .prepare(
        `SELECT id, trip_id AS tripId, day_id AS dayId, title, kind, start, "end" AS "end", status, notes
         FROM events WHERE id = ?`,
      )
      .get(eventId) as Event | undefined;
  }

  private ensureDays(tripId: string, startDate: string, endDate: string): void {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const date = new Date(t).toISOString().slice(0, 10);
      this.db
        .prepare("INSERT INTO days (id, trip_id, date) VALUES (?, ?, ?)")
        .run(randomUUID(), tripId, date);
    }
  }
}
