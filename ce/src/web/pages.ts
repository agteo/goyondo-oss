import type { Day, Event, Trip } from "../domain/types.ts";
import type { WeatherDetails } from "../weather/adapter.ts";

export function renderGatePage(opts: { mode: "register" | "login" }): string {
  const action = opts.mode === "register" ? "/register" : "/login";
  const title = opts.mode === "register" ? "Create operator" : "Sign in";
  return layout(
    title,
    `<form method="post" action="${action}">
      <label>Username <input name="username" required></label>
      <label>Password <input name="password" type="password" required></label>
      <button type="submit">${title}</button>
    </form>`,
  );
}

export function renderDayPage(view: {
  state: string;
  trip?: Trip;
  day?: Day;
  days?: Day[];
  events?: Event[];
  weather?: WeatherDetails;
  message?: string;
}): string {
  const weather =
    view.weather?.status === "ok"
      ? `${view.weather.summary ?? ""} ${view.weather.tempC ?? ""}°C`
      : `Weather unavailable${view.weather?.reason ? ` (${view.weather.reason})` : ""}`;
  const events = (view.events ?? [])
    .map(
      (event) =>
        `<li data-conflict="${event.conflict ? "true" : "false"}">
          <strong>${escapeHtml(event.title)}</strong>
          ${event.start}–${event.end}
          ${event.conflict ? "<span class='conflict'>conflict</span>" : ""}
        </li>`,
    )
    .join("");
  return layout(
    view.trip?.name ?? "Goyondo CE",
    `<header>
      <p>${escapeHtml(view.trip?.name ?? "No trip")}</p>
      <p>${escapeHtml(view.day?.date ?? view.state)}</p>
    </header>
    <section data-weather>${escapeHtml(weather)}</section>
    <ol data-events>${events || "<li>No events</li>"}</ol>
    <p>${escapeHtml(view.message ?? "")}</p>
    <form id="add-event">
      <input name="title" placeholder="Add event" required>
      <input name="start" placeholder="start ISO">
      <input name="end" placeholder="end ISO">
      <button type="submit">Add event</button>
    </form>
    <p><a href="/agent-token" id="mint-hint">Mint agent token via POST /agent-token</a></p>`,
  );
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 0 auto; padding: 1rem; }
  label { display: block; margin: 0.5rem 0; }
  .conflict { color: #b45309; }
  li[data-conflict="true"] { outline: 1px solid #b45309; }
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
