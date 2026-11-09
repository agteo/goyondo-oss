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
| Guessing `origin` | Omit it. The server uses the user's home base. Pass `origin` only when the user says where they start. It does not change the home base. |
| Writing `home_base` | Agents cannot set it. The call returns `confirmation_required` and a `confirm_url`. Give that link to the user. Nothing is saved until they confirm it in the app. |
| `children` with no adult left in `travelers` | The write fails. Infants, children, and teens together must be less than `travelers`. |
| Hotel on a night spent in transit | Set `metadata.overnight_transport: true` on that `transport` activity. Do not also add accommodation unless the user has one. Do not set the flag for daytime transport. |

Taught capability names in this pack: `list_trips`, `create_trip`.
