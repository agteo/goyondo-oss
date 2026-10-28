import type { Day, Event, Trip } from "../domain/types.ts";
import type { PlanWarning } from "../domain/warnings.ts";
import type { WeatherDetails } from "../weather/adapter.ts";

export function renderGatePage(opts: { mode: "register" | "login" }): string {
  const action = opts.mode === "register" ? "/register" : "/login";
  const title = opts.mode === "register" ? "Create operator" : "Sign in";
  return layout(
    title,
    `<main class="sheet">
      <p class="wordmark">Goyondo</p>
      <p class="kicker">Community Edition</p>
      <h1>${title}</h1>
      <p class="lede">One operator, solo trips. Your agent uses a <span class="mono">gce_</span> token from this instance.</p>
      <form method="post" action="${action}" class="stack">
        <label>Username <input name="username" required autocomplete="username"></label>
        <label>Password <input name="password" type="password" required autocomplete="${opts.mode === "register" ? "new-password" : "current-password"}"></label>
        <button type="submit">${title}</button>
      </form>
    </main>`,
  );
}

export function renderDayPage(view: {
  state: string;
  trip?: Trip;
  trips?: Trip[];
  day?: Day;
  days?: Day[];
  events?: Event[];
  warnings?: PlanWarning[];
  weather?: WeatherDetails;
  message?: string;
  agentToken?: string;
}): string {
  const weather =
    view.weather?.status === "ok"
      ? `${view.weather.summary ?? ""} ${view.weather.tempC ?? ""}°C`.trim()
      : `Weather unavailable${view.weather?.reason ? ` (${view.weather.reason})` : ""}`;
  const trip = view.trip;
  const day = view.day;
  const days = view.days ?? [];
  const events = view.events ?? [];
  const warnings = view.warnings ?? [];
  const tripQuery = trip ? `trip=${encodeURIComponent(trip.id)}` : "";
  const dayLinks = days
    .map((item) => {
      const selected = item.id === day?.id;
      return `<a data-selected="${selected ? "true" : "false"}" href="/today?${tripQuery}&amp;day=${encodeURIComponent(item.id)}">${escapeHtml(item.date.slice(5))}</a>`;
    })
    .join("");
  const tripLinks = (view.trips ?? [])
    .map(
      (item) =>
        `<a data-selected="${item.id === trip?.id ? "true" : "false"}" href="/today?trip=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a>`,
    )
    .join("");
  const eventItems = events
    .map((event) => {
      const conflict = event.conflict ? "true" : "false";
      return `<li class="event" data-conflict="${conflict}">
        <div>
          <strong>${escapeHtml(event.title)}</strong>
          <span class="meta">${escapeHtml(event.kind)} · ${escapeHtml(event.start)}–${escapeHtml(event.end)}</span>
          ${event.conflict ? "<span class='conflict'>Overlap</span>" : ""}
        </div>
        <form method="post" action="/today/events/${encodeURIComponent(event.id)}/move" class="inline">
          <input name="start" value="${escapeHtml(event.start)}" aria-label="New start">
          <input name="end" value="${escapeHtml(event.end)}" aria-label="New end">
          <button type="submit" class="secondary">Move</button>
        </form>
        <form method="post" action="/today/events/${encodeURIComponent(event.id)}/cancel">
          <button type="submit" class="quiet">Cancel</button>
        </form>
      </li>`;
    })
    .join("");
  const warningItems = warnings
    .map(
      (warning) =>
        `<li data-severity="${warning.severity}"><strong>${escapeHtml(warning.title)}</strong> ${escapeHtml(warning.summary)}</li>`,
    )
    .join("");
  const createTrip = `<details class="panel" ${trip ? "" : "open"}>
      <summary>New trip</summary>
      <form method="post" action="/today/trips" class="stack">
        <label>Name <input name="name" required></label>
        <label>Place <input name="place" required></label>
        <label>Start <input name="startDate" required placeholder="YYYY-MM-DD"></label>
        <label>End <input name="endDate" required placeholder="YYYY-MM-DD"></label>
        <button type="submit">Create trip</button>
      </form>
    </details>`;
  const dayTools =
    trip && day
      ? `<form id="add-event" method="post" action="/today/events" class="stack">
          <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
          <input type="hidden" name="dayId" value="${escapeHtml(day.id)}">
          <label>Title <input name="title" required></label>
          <label>Kind
            <select name="kind">
              <option>activity</option><option>meal</option><option>flight</option>
              <option>hotel</option><option>transfer</option><option>other</option>
            </select>
          </label>
          <label>Start <input name="start" required placeholder="2026-11-01T09:00:00"></label>
          <label>End <input name="end" required placeholder="2026-11-01T10:00:00"></label>
          <button type="submit">Add event</button>
        </form>
        <form method="post" action="/today/notes" class="stack">
          <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
          <input type="hidden" name="dayId" value="${escapeHtml(day.id)}">
          <label>Day notes <textarea name="notes">${escapeHtml(day.notes ?? "")}</textarea></label>
          <button type="submit" class="secondary">Save notes</button>
        </form>
        <form method="post" action="/today/documents" class="stack">
          <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
          <label>Filename <input name="filename" value="note.txt"></label>
          <label>Document <textarea name="text" placeholder="Paste a confirmation or note"></textarea></label>
          <label>Instruction <input name="instruction" placeholder="Optional instruction for the proposal"></label>
          <button type="submit" class="secondary">Attach document</button>
        </form>`
      : "";
  const token = view.agentToken
    ? `<p class="token" data-agent-token>Store this token now. It will not be shown again.<br><code>${escapeHtml(view.agentToken)}</code></p>`
    : `<form method="post" action="/today/agent-token?${tripQuery}${day ? `&amp;day=${encodeURIComponent(day.id)}` : ""}">
        <button type="submit" class="quiet">Mint agent token</button>
      </form>
      <p class="meta">One-time <span class="mono">gce_</span> token for <span class="mono">POST /api/agent/task</span>. MCP stays on goyondo.run.</p>`;

  return layout(
    trip?.name ?? "Goyondo CE",
    `<main>
      <p class="wordmark">Goyondo</p>
      <p class="kicker">Community Edition</p>
      <h1>${escapeHtml(trip?.name ?? "Solo trips")}</h1>
      <p class="lede">${escapeHtml(trip ? `${trip.place} · ${trip.startDate} – ${trip.endDate}` : view.state)}</p>
      ${(view.trips ?? []).length > 1 ? `<nav class="day-row" data-trips>${tripLinks}</nav>` : ""}
      ${days.length ? `<nav class="day-row" data-day-row>${dayLinks}</nav>` : ""}
      <section data-weather class="meta">${escapeHtml(weather)}</section>
      ${warningItems ? `<ul data-warnings class="warnings">${warningItems}</ul>` : `<ul data-warnings hidden></ul>`}
      <ol data-events>${eventItems || "<li class='empty'>No events</li>"}</ol>
      ${view.message ? `<p class="message">${escapeHtml(view.message)}</p>` : ""}
      ${dayTools}
      ${createTrip}
      <section class="token-block">${token}</section>
    </main>`,
  );
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.bunny.net/css?family=libre-franklin:400,500,600">
<style>
  :root {
    --accent: #356448;
    --accent-hover: #23382e;
    --accent-light: #e6efe7;
    --sand: #faf9f7;
    --ink: #1c1917;
    --muted: #57534e;
    --line: #e7e5e4;
    --warn: #b45309;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--sand);
    color: var(--ink);
    font-family: "Libre Franklin", Arial, Helvetica, sans-serif;
    font-size: 15px;
    line-height: 1.5;
  }
  main { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
  .wordmark { font-family: Georgia, "Times New Roman", serif; letter-spacing: -0.03em; font-size: 1.35rem; margin: 0; }
  .kicker { margin: 0.15rem 0 1.25rem; color: var(--accent); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 2.25rem; letter-spacing: -0.03em; margin: 0; }
  .lede, .meta { color: var(--muted); }
  .sheet, .panel, .event, form.stack, .token-block {
    background: white;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  }
  .sheet, .panel, form.stack, .token-block { padding: 1rem; margin: 1rem 0; }
  .day-row { display: flex; gap: 0.5rem; overflow-x: auto; padding: 0.25rem 0 0.75rem; }
  .day-row a {
    color: var(--muted);
    text-decoration: none;
    padding: 0.35rem 0.2rem;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .day-row a[data-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
  ol { list-style: none; padding: 0; margin: 0; }
  .event { display: grid; gap: 0.6rem; padding: 0.9rem 1rem; margin: 0.6rem 0; }
  .event[data-conflict="true"] { background: #fffbeb; }
  .conflict { color: var(--warn); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  .warnings { background: #fffbeb; border-radius: 12px; padding: 0.75rem 1rem 0.75rem 1.5rem; color: #78350f; }
  label { display: grid; gap: 0.25rem; font-size: 0.85rem; font-weight: 500; }
  input, select, textarea {
    font: inherit;
    border: 1px solid #d6d3d1;
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
    background: white;
  }
  textarea { min-height: 5rem; }
  button {
    font: inherit;
    font-weight: 600;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: white;
    padding: 0.55rem 1rem;
    cursor: pointer;
  }
  button.secondary { background: white; color: var(--accent); border: 1.5px solid #c5d7c9; }
  button.quiet { background: transparent; color: var(--accent); padding-left: 0; }
  .inline { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; background: transparent; border: 0; box-shadow: none; padding: 0; margin: 0; }
  .token code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .token { background: var(--accent-light); padding: 0.75rem; border-radius: 8px; }
  .message { color: var(--warn); }
  .empty { color: var(--muted); padding: 0.5rem 0; }
  summary { cursor: pointer; font-weight: 600; }
</style>
<body>${body}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
