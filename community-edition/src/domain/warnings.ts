import type { Event } from "./types.ts";

export type PlanWarning = {
  id: string;
  type: "duplicate_event" | "time_overlap" | "repeated_event";
  severity: "warning" | "info";
  title: string;
  summary: string;
  suggested_action: string;
  affected_event_ids: string[];
  affected_event_titles: string[];
  day_id: string;
  date: string;
};

export type WarningDay = {
  id: string;
  date: string;
  events: Event[];
};

const REPEATABLE_KINDS = new Set(["hotel", "flight", "transfer"]);

function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

function overlaps(a: Event, b: Event): boolean {
  const aStart = toMs(a.start);
  const aEnd = toMs(a.end);
  const bStart = toMs(b.start);
  const bEnd = toMs(b.end);
  if ([aStart, aEnd, bStart, bEnd].some((value) => Number.isNaN(value))) {
    return false;
  }
  return aStart < bEnd && bStart < aEnd;
}

function refs(events: Event[]) {
  return {
    affected_event_ids: events.map((event) => event.id),
    affected_event_titles: events.map((event) => event.title),
  };
}

function checkDuplicates(day: WarningDay, dayNumber: number): PlanWarning[] {
  const groups = new Map<string, Event[]>();
  for (const event of day.events) {
    if (event.status === "canceled" || REPEATABLE_KINDS.has(event.kind)) {
      continue;
    }
    const key = normaliseText(event.title);
    if (!key) {
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  const warnings: PlanWarning[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    warnings.push({
      id: `duplicate-${day.id}-${normaliseText(group[0]!.title).slice(0, 40).replaceAll(" ", "-")}`,
      type: "duplicate_event",
      severity: "warning",
      title: `${day.date} has ${group.length} similar events`,
      summary: `"${group[0]!.title}" appears ${group.length} times on day ${dayNumber} (${day.date}).`,
      suggested_action: "Cancel the extra copy with cancel_event unless it was intentional.",
      ...refs(group),
      day_id: day.id,
      date: day.date,
    });
  }
  return warnings;
}

function checkOverlaps(day: WarningDay, dayNumber: number): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const events = day.events.filter((event) => event.status !== "canceled");
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]!;
      const b = events[j]!;
      if (!overlaps(a, b)) {
        continue;
      }
      warnings.push({
        id: `overlap-${day.id}-${a.id}-${b.id}`,
        type: "time_overlap",
        severity: "warning",
        title: `${day.date}: "${a.title}" and "${b.title}" overlap`,
        summary: `"${b.title}" (${b.start}–${b.end}) overlaps "${a.title}" (${a.start}–${a.end}) on day ${dayNumber}.`,
        suggested_action: `Move "${b.title}" with move_event, or cancel it with cancel_event.`,
        ...refs([a, b]),
        day_id: day.id,
        date: day.date,
      });
    }
  }
  return warnings;
}

function checkRepeats(days: WarningDay[]): PlanWarning[] {
  const byTitle = new Map<string, { event: Event; day: WarningDay }[]>();
  for (const day of days) {
    for (const event of day.events) {
      if (event.status === "canceled" || REPEATABLE_KINDS.has(event.kind)) {
        continue;
      }
      const key = normaliseText(event.title);
      if (!key) {
        continue;
      }
      const entries = byTitle.get(key) ?? [];
      entries.push({ event, day });
      byTitle.set(key, entries);
    }
  }
  const warnings: PlanWarning[] = [];
  for (const [key, entries] of byTitle) {
    const dayIds = [...new Set(entries.map((entry) => entry.day.id))];
    if (dayIds.length < 2) {
      continue;
    }
    const dates = [...new Set(entries.map((entry) => entry.day.date))];
    const first = entries[0]!;
    warnings.push({
      id: `repeat-${key.slice(0, 60).replaceAll(" ", "-")}`,
      type: "repeated_event",
      severity: "info",
      title: `"${first.event.title}" is planned on ${dayIds.length} days`,
      summary: `It appears on ${dates.join(", ")}.`,
      suggested_action: "Cancel the extra days with cancel_event if the repeat was not intentional.",
      ...refs(entries.map((entry) => entry.event)),
      day_id: first.day.id,
      date: first.day.date,
    });
  }
  return warnings;
}

export function planWarnings(days: WarningDay[]): PlanWarning[] {
  const warnings = [
    ...days.flatMap((day, index) => checkDuplicates(day, index + 1)),
    ...days.flatMap((day, index) => checkOverlaps(day, index + 1)),
    ...checkRepeats(days),
  ];
  const rank = { warning: 0, info: 1 };
  return warnings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function warningsForEvents(warnings: PlanWarning[], eventIds: string[]): PlanWarning[] {
  const ids = new Set(eventIds.filter(Boolean));
  if (ids.size === 0) {
    return [];
  }
  return warnings.filter((warning) => warning.affected_event_ids.some((id) => ids.has(id)));
}
