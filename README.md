# Goyondo OSS

**Reference examples and agent docs for [Goyondo](https://goyondo.run)** — an AI travel planner that your own agent can operate.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-examples-informational)](#what-this-repo-is)
[![API](https://img.shields.io/badge/runtime-goyondo.run-0f766e)](https://goyondo.run)

**Product:** [goyondo.run](https://goyondo.run) · **Agent overview:** [llms.txt](https://goyondo.run/llms.txt) · **Auth:** [auth.md](https://goyondo.run/auth.md)

---

## What is Goyondo?

[Goyondo](https://goyondo.run) is a hosted travel-planning product. People (and the agents they delegate) can:

- Create trips and generate or edit day-by-day itineraries
- Store destinations, dates, travelers, and preferences in one place
- Collaborate on group trips
- Use a scoped API key so an agent can list trips, create trips, and call other published capabilities on the user’s behalf

The app lives at **https://goyondo.run**. You do not install Goyondo from this repository. You sign in there (free tier includes **10 trips** with an API key) and connect an agent.

## What this repo is

A **public, versioned map** for humans and AI agents: domain model, pitfalls, and copy-paste scripts that talk to the hosted API.

It is **not** an SDK, not a self-hosted Goyondo, and not the source of truth for capability names or JSON argument schemas. Those come from the live service:

- `GET https://goyondo.run/api/agent/capabilities`
- `GET https://goyondo.run/api/agent/card`

> [!NOTE]
> Discovery starts at [`llms.txt`](https://goyondo.run/llms.txt). Use this repo when you need a stable schema, runnable examples, and the mistakes agents actually make.

## Why it exists

- **Agents** need a short, forkable reference they can read before any auth.
- **Developers** need Python, TypeScript, and curl that start with an empty API key and complete device authorization.
- **Goyondo itself** stays the runtime, so this repo can stay small and MIT-licensed.

## Contents

- [Quickstart](#quickstart)
- [SCHEMA.md](SCHEMA.md)
- [PITFALLS.md](PITFALLS.md)
- [Project layout](#project-layout)
- [How agents should use this](#how-agents-should-use-this)
- [Domain model](#domain-model)
- [Pitfalls](#pitfalls)
- [Authentication](#authentication-flow)
- [API examples](#calling-list_trips)
- [Docs](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Quickstart

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
└── examples/
    ├── curl/quickstart.sh
    ├── python/quickstart.py
    └── typescript/quickstart.ts
```

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

See **[SCHEMA.md](SCHEMA.md)** — Trip → itinerary days → activities, plus user preferences. There is no `Segment` type.

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

This is an early public reference, not a full application. Issues and PRs that fix examples, schema docs, or pitfalls against the live API are welcome. Do not send secrets or production keys.

## License

[MIT](LICENSE)
