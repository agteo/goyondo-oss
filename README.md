# Goyondo OSS

Run your own trip manager, or connect an agent to hosted [Goyondo](https://goyondo.run).

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-community%20edition-0f766e)](#run-your-own-trip-manager)

---

## Run your own trip manager

Community Edition in [`community-edition/`](community-edition/) is a single-operator trip manager: days, events, optional weather, and an agent API. It does not need a Goyondo account. It is not a copy of goyondo.run. See [Which API am I talking to?](#which-api-am-i-talking-to).

Node.js 22.13 or newer.

```bash
cd community-edition
npm install
npm run dev
```

Open http://127.0.0.1:8787. The first visitor creates the only operator account. On that page, create a trip with a name, place, and dates. The database is `community-edition/data/ce.sqlite`.

Weather and document parsing are optional. Copy `community-edition/.env.example` to `community-edition/.env`, set `WEATHER_API_KEY` and/or `LLM_API_KEY`, and restart. Leave `CE_DATA_DIR` unset on your machine. A VPS setup is in [community-edition/README.md](community-edition/README.md).

After you are signed in, mint a `gce_…` token from the page and call `POST /api/agent/task`. Trip fields are `name`, `place`, `start_date`, and `end_date`. Agent notes: [community-edition/src/agent/schema.md](community-edition/src/agent/schema.md).

## Hosted API examples

[Goyondo](https://goyondo.run) is the hosted planner: itineraries, group trips, and a scoped API key. These examples talk to that service. They are not an SDK. Capability names and argument schemas come from the live service:

- `GET https://goyondo.run/api/agent/capabilities`
- `GET https://goyondo.run/api/agent/card`

Self-authored trips have no trip-count cap when the agent passes `skip_ai_generation: true` and writes the itinerary itself. Starter includes 3 active Goyondo AI-planned trips, or 10 after any API key is created. Pro has no AI trip-count cap. The live card is the quota source.

> [!NOTE]
> Hosted discovery starts at [`llms.txt`](https://goyondo.run/llms.txt). Use this repo for a stable schema, runnable examples, and the mistakes agents actually make.

## Contents

- [Run your own trip manager](#run-your-own-trip-manager)
- [Hosted quickstart](#hosted-quickstart)
- [SCHEMA.md](SCHEMA.md)
- [PITFALLS.md](PITFALLS.md)
- [Project layout](#project-layout)
- [Which API am I talking to?](#which-api-am-i-talking-to)
- [How agents should use this](#how-agents-should-use-this)
- [Domain model](#domain-model)
- [Pitfalls](#pitfalls)
- [Authentication](#authentication-flow)
- [API examples](#calling-list_trips)
- [Docs](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Hosted quickstart

You need a Goyondo account. No API key is required to start.

```bash
cp .env.example .env
# leave GOYONDO_API_KEY empty

# curl (needs jq)
bash examples/curl/quickstart.sh

# Python 3.10+
pip install -r examples/python/requirements.txt
python3 examples/python/quickstart.py

# TypeScript / Node 18+
npx --yes tsx examples/typescript/quickstart.ts
```

Each script prints `verification_uri_complete`. Open that URL, sign in, tap **Grant access**. The script polls until it receives a `gyd_*` token (**one-time reveal** — store it, e.g. as `GOYONDO_API_KEY` in `.env`). Then it calls `list_trips`.

An empty trip list is a **successful** first run.

Optional write (needs `trips:write`; skips AI itinerary generation):

```bash
bash examples/curl/quickstart.sh --create
python3 examples/python/quickstart.py --create
npx --yes tsx examples/typescript/quickstart.ts --create
```

## Project layout

```
goyondo-oss/
├── README.md                 # You are here
├── SCHEMA.md                 # Trip → days → activities
├── PITFALLS.md               # Load-bearing agent mistakes
├── LICENSE                   # MIT
├── .env.example               # GOYONDO_BASE_URL, GOYONDO_API_KEY
├── scripts/check_capabilities.py
├── examples/                 # Hosted goyondo.run
│   ├── curl/quickstart.sh
│   ├── python/quickstart.py
│   └── typescript/quickstart.ts
└── community-edition/        # Self-hosted Community Edition (separate API)
    ├── README.md
    └── src/agent/schema.md   # CE vocabulary: trip, day, event
```

## Which API am I talking to?

Hosted Goyondo and Community Edition both serve `POST /api/agent/task` and both have `list_trips`. Their other capabilities, argument names, and tokens differ. Check before you call anything else:

```bash
curl -s "$BASE_URL/api/agent/card" | jq '{name, edition, api_version}'
```

| | Hosted (`goyondo.run`) | Community Edition (`community-edition/`) |
| ---- | ---- | ---- |
| Card | `"name": "Goyondo"`, has `api_version` | `"edition": "community"`, `"hosted": false` |
| Token | `gyd_…` via device auth | `gce_…` minted in the CE UI |
| Day id for writes | `itinerary_id` | `day_id` |
| Itinerary entry | activity (`add_activity`) | event (`create_event` / `create_events`) |
| Create a trip | `create_trip` with `destination`; AI is optional | `create_trip` with `name`, `place`, and dates only |
| Plan checks | `get_trip_alerts` (includes maps) | `get_plan_warnings` (local overlaps and duplicates) |
| Docs | SCHEMA.md, PITFALLS.md | [`community-edition/src/agent/schema.md`](community-edition/src/agent/schema.md) |

CE rejects hosted capability names, hosted argument names, and `gyd_` keys with an error naming the CE equivalent.

## How agents should use this

1. Read this README, then [SCHEMA.md](SCHEMA.md) and [PITFALLS.md](PITFALLS.md).
2. Copy or adapt one flow under `examples/`.
3. Discover live capabilities from `GET /api/agent/capabilities`.
4. Start device auth — do not scrape `/connect`.
5. Call `POST /api/agent/task` with **flat** `arguments`.

Verified against agent `api_version` **2026-03-20** (Goyondo agent-card default as of 2026-09-10). If `GET https://goyondo.run/api/agent/card` shows a different `api_version`, trust the live card.

Taught names (`list_trips`, `create_trip`) can be checked without an API key:

```bash
python3 scripts/check_capabilities.py --fixture path/to/capabilities.json
# or against live:
python3 scripts/check_capabilities.py
```

## Domain model

See **[SCHEMA.md](SCHEMA.md)** — Trip → itinerary days → activities, plus business-travel segments and user preferences.

## Pitfalls

See **[PITFALLS.md](PITFALLS.md)** — flat `arguments`, one-time token reveal, empty `list_trips` is success, never scrape `/connect`.

## Authentication flow

1. `POST /api/agent-auth/device` with `agent_name` and `requested_scopes`.
2. Show the user `verification_uri_complete`.
3. Poll `POST /api/agent-auth/token` with `device_code`.
4. `authorization_pending` means keep polling. Stop on `expired_token`, `access_denied`, `invalid_grant`, or any other non-pending error.
5. Persist `access_token`.

## Calling `list_trips`

```http
POST https://goyondo.run/api/agent/task
Authorization: Bearer gyd_…
Content-Type: application/json

{ "capability": "list_trips", "arguments": {} }
```

## Calling `create_trip`

```json
{
  "capability": "create_trip",
  "arguments": {
    "destination": "Kyoto",
    "start_date": "2026-11-01",
    "end_date": "2026-11-03",
    "travelers": 1,
    "skip_ai_generation": true
  }
}
```

## Error handling

| Code | Where | What to do |
| ---- | ---- | ---- |
| `authorization_pending` | token poll | Keep polling every `interval` seconds. |
| `expired_token` | token poll | Restart device auth. |
| `access_denied` | token poll | User denied, or token already retrieved. Restart device auth. |
| `invalid_grant` | token poll | Restart device auth. |
| `401` | task/API | Key expired or revoked. Restart device auth. |
| `429` | any | Back off. See rate limits on `GET /api/agent/card`. |

## Documentation

| Resource | Role |
| ---- | ---- |
| [goyondo.run](https://goyondo.run) | Hosted product |
| [llms.txt](https://goyondo.run/llms.txt) | Agent discovery / overview |
| [Agent quickstart](https://goyondo.run/agent-quickstart.md) | First-run copy-paste |
| [auth.md](https://goyondo.run/auth.md) | Device authorization |
| `GET /api/agent/card` | Version, pricing, quotas, rate limits |
| `GET /api/agent/capabilities` | Capability names and argument schemas |
| [Pricing](https://goyondo.run/pricing) | Human pricing page |

## Contributing

Issues and PRs that fix Community Edition, the examples, the schema notes, or the pitfalls against the live API are welcome. Do not send secrets or production keys.

## License

[MIT](LICENSE)
