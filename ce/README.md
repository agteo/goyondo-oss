# Goyondo Community Edition

Self-hosted travel harness: day itinerary, weather (optional key), event edits, document drop with propose/confirm, and an agent API. Not [goyondo.run](https://goyondo.run). No Goyondo account required.

## Quick start (local)

```bash
cd ce
cp .env.example .env
npm install
npm test
npm run dev
```

Open http://127.0.0.1:8787 — first visitor becomes the only operator.

Optional in `.env`: `WEATHER_API_KEY` (OpenWeatherMap), `LLM_API_KEY` (OpenAI-compatible). Maps keys are not used.

## VPS (Docker Compose)

```bash
cd ce
cp .env.example .env
# set SESSION_SECRET; add weather/LLM keys if you want those features
docker compose up --build -d
```

TLS (HTTPS) is operator-owned. Put Caddy or nginx in front for a real trip. Compose exposes HTTP on port 8787 for a first boot.

SQLite lives in the `ce-data` volume (`/data/ce.sqlite`). Copy that file to back up.

## Agent access

After sign-in, `POST /agent-token` (session cookie) returns a `gce_…` bearer token **once**. Store it.

Then:

- `GET /api/agent/capabilities`
- `GET /api/agent/schema`
- `POST /api/agent/task` with `{ "capability": "list_trips", "arguments": {} }`

Hosted Goyondo names (`activities`, `itinerary_id`) are not accepted. See `src/agent/schema.md`.

## Create a trip

Signed-in: `POST /api/ui/trips` with `{ "name", "startDate", "endDate", "place" }` (`YYYY-MM-DD`). Then open `/today`.
