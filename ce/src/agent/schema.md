# Community Edition agent schema

This instance is **not** hosted Goyondo. Vocabulary is CE-native: **trip**, **day**, **event**, **conflict**.

Hosted Goyondo (`SCHEMA.md` in the repo root) uses `activities` and `itinerary_id`. Those names are **not** accepted here.

## Which API is this?

`GET /api/agent/card` needs no token. CE returns `"edition": "community"` and `"hosted": false`. Hosted Goyondo returns `"name": "Goyondo"` with an `api_version`.

If you send hosted names here, CE says so instead of failing silently:

- `hosted_capability_not_available` (400): e.g. `add_activity`, `create_trip`. The message names the CE equivalent.
- `hosted_argument_names` (400): e.g. `itinerary_id`. `use_instead` maps it to the CE name.
- `401` with a `gyd_` key: that key belongs to goyondo.run.

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
