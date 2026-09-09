# Goyondo agent examples

Reference scripts for connecting a delegated agent to [Goyondo](https://goyondo.run).

## What this repo is

Copy-paste examples that:

1. Start with **no API key**.
2. Run device authorization (RFC 8628).
3. Call `list_trips`.
4. Optionally call `create_trip` with `skip_ai_generation: true` (no AI itinerary).

Canonical public base URL: `https://goyondo.run`.

## What this repo is not

This is **not** an official SDK. There is no package to install, no versioned client, and no support SLA. Goyondo does not publish `goyondo-py` (or any other SDK) yet.

Do not treat these files as the source of truth for argument names or capability lists.

## Prerequisites

- A Goyondo user who can tap **Grant access** at `https://goyondo.run/connect`
- For curl: `curl` and `jq`
- For Python: Python 3.10+ and `pip install -r examples/python/requirements.txt`
- For TypeScript: Node 18+ (`npx tsx examples/typescript/quickstart.ts`)

No secret is required to start. Do not scrape `/connect` to discover auth.

## Quickstart

```bash
cp .env.example .env
# leave GOYONDO_API_KEY empty

# curl
bash examples/curl/quickstart.sh

# python
python3 examples/python/quickstart.py

# typescript
npx --yes tsx examples/typescript/quickstart.ts
```

Each script prints `verification_uri_complete`. Open that URL, sign in, tap **Grant access**. The script polls `POST /api/agent-auth/token` until it receives a `gyd_*` token (one-time reveal — store it). Then it calls `list_trips`.

An empty `result.data` array is a valid success.

Optional write (needs `trips:write` on the granted key):

```bash
bash examples/curl/quickstart.sh --create
python3 examples/python/quickstart.py --create
npx --yes tsx examples/typescript/quickstart.ts --create
```

## Authentication flow

1. `POST /api/agent-auth/device` with `agent_name` and `requested_scopes`.
2. Show the user `verification_uri_complete`.
3. Poll `POST /api/agent-auth/token` with `device_code`.
4. `authorization_pending` means keep polling. Stop on `expired_token`, `access_denied`, `invalid_grant`, or any other non-pending error.
5. Persist `access_token`. Polling again after success returns `access_denied`. Keys default to a 90-day TTL.

Canonical auth docs: https://goyondo.run/auth.md

## Capability discovery

Do not hard-code schemas from this repo.

- `GET https://goyondo.run/api/agent/capabilities`
- `GET https://goyondo.run/api/agent/card`

## Calling `list_trips`

```http
POST https://goyondo.run/api/agent/task
Authorization: Bearer gyd_…
Content-Type: application/json

{ "capability": "list_trips", "arguments": {} }
```

Use `arguments` (canonical). Flat top-level aliases are accepted. Do not nest fields under `body`.

## Calling `create_trip`

Pass `skip_ai_generation: true` so the example does not trigger AI itinerary generation:

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

This path is supported on `POST /api/agent/task`.

## Error handling

| Code | Where | What to do |
| ---- | ----- | ---------- |
| `authorization_pending` | token poll | Keep polling every `interval` seconds. |
| `expired_token` | token poll | Restart device auth. |
| `access_denied` | token poll | User denied, or token already retrieved. Restart device auth. |
| `invalid_grant` | token poll | Restart device auth. |
| `401` | task/API | Key expired or revoked. Restart device auth. |
| `429` | any | Back off. See rate limits on `GET /api/agent/card`. |

## Canonical docs

- Quickstart: https://goyondo.run/agent-quickstart.md
- Auth: https://goyondo.run/auth.md
- Agent card (API version and breaking-change signal): `GET https://goyondo.run/api/agent/card`
- Capabilities: `GET https://goyondo.run/api/agent/capabilities`
- Overview: https://goyondo.run/llms.txt
- Pricing: https://goyondo.run/pricing
