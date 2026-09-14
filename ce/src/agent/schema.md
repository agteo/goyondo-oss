# Community Edition agent schema

This instance is **not** hosted Goyondo. Vocabulary is CE-native: **trip**, **day**, **event**, **conflict**.

Hosted Goyondo (`SCHEMA.md` in the repo root) uses `activities` and `itinerary_id`. Those names are **not** accepted here.

## Auth

`Authorization: Bearer <token>` where the token was minted once in the CE UI (`gce_…`).

## Calls

`GET /api/agent/capabilities` — capability names and argument schemas.

`GET /api/agent/schema` — this document.

`POST /api/agent/task`

```json
{ "capability": "list_trips", "arguments": {} }
```

Do **not** nest arguments under `body`. Flat `{ capability, arguments }` only.

## Mapping from hosted Goyondo (read-only)

| Hosted | CE |
|--------|----|
| activity | event |
| itinerary day `id` / `itinerary_id` | `day_id` |
| `skip_ai_generation` | not applicable; create events directly |

## Events

An event has `id`, `trip_id`, `day_id`, `title`, `kind`, `start`, `end`, `status` (`active` | `canceled`), and `conflict` (boolean) on list/get-day.
