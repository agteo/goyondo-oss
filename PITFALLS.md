# Goyondo agent pitfalls

Load-bearing mistakes. Argument schemas still come from `GET https://goyondo.run/api/agent/capabilities`.

| Pitfall | What to do |
| ---- | ---- |
| Nested args (`body`, `activity`, `data`) | Canonical: `{ "capability": "…", "arguments": { … } }`. Flat top-level aliases are accepted. Never nest fields under `body`. |
| One-time token reveal | Persist `access_token` on first success. Polling `POST /api/agent-auth/token` again returns `access_denied`. |
| `authorization_pending` | Normal. Poll every `interval` seconds. Stop on `expired_token`, `access_denied`, `invalid_grant`. |
| Empty `list_trips` | Valid success. Do not retry as if auth failed. |
| Scraping `/connect` | Forbidden. First call is `POST /api/agent-auth/device`. `/connect` is the human approval page after that. |
| Token TTL / 401 | Keys default to 90-day TTL. 401 → restart device auth. |
| Hard-coding capabilities from this repo | Use the live registry. This pack can lag. |
| `day_id` for placement | Use `itinerary_id` from `get_trip`, then `get_trip` again to verify. |

Taught capability names in this pack: `list_trips`, `create_trip`.
