# Community Edition agent schema

This instance is **not** hosted Goyondo. Vocabulary is CE-native: **trip**, **day**, **event**, **warning**.

Hosted Goyondo (`SCHEMA.md` in the repo root) uses `activities` and `itinerary_id`. Those names are **not** accepted here. MCP is hosted-only. CE agents call `POST /api/agent/task`.

## Which API is this?

`GET /api/agent/card`, `GET /api/agent/capabilities`, and `GET /api/agent/schema` need no token. CE returns `"edition": "community"` and `"hosted": false`. The card `first_run.first_capability` is `list_trips`, and an empty trip list is success. Hosted Goyondo returns `"name": "Goyondo"` with an `api_version`.

If you send hosted names here, CE says so instead of failing silently. Errors use `{ "error": { "code", "message" } }`:

- `hosted_capability_not_available` (400): e.g. `add_activity`, `save_itinerary`, `get_trip_alerts`. The message names the CE equivalent.
- `hosted_argument_names` (400): e.g. `itinerary_id`, `destination`. `use_instead` maps it to the CE name.
- `capability_not_found` (404): includes `available_capabilities`.
- `validation_failed` (400): the message says what to fix. Nothing was written.
- `401` with a `gyd_` key: that key belongs to goyondo.run.

## Auth

`Authorization: Bearer <token>` where the token was minted once in the CE UI (`gce_…`). There is no device-auth flow.

## Calls

`GET /api/agent/capabilities` — capability names and argument schemas. Public.

`GET /api/agent/schema` — this document. Public.

`POST /api/agent/task`

```json
{ "capability": "list_trips", "arguments": {} }
```

Do **not** nest arguments under `body`. Flat `{ capability, arguments }` only.

`list_trips` returns `{ "trips": [], "has_more": false }`. Pass `limit` (1–100) to page.

`create_trip` arguments are `name`, `start_date`, `end_date`, and `place` (`YYYY-MM-DD`). It creates empty days and does not generate an itinerary. `destination` and `skip_ai_generation` are hosted argument names.

`create_events` writes many events in one call: `{ "trip_id", "days": [{ "day_id", "events": [{ "title", "start", "end" }] }] }`. Limits are 31 days, 20 events per day, and 150 events per call. If any event is invalid, nothing is saved. The result includes `warnings`.

`get_plan_warnings` returns local checks only: overlapping times, the same title twice on one day, and the same title on more than one day. Hotel, flight, and transfer titles may repeat. There is no places or map lookup.

## Mapping from hosted Goyondo (read-only)

| Hosted | CE |
|--------|----|
| activity | event |
| itinerary day `id` / `itinerary_id` | `day_id` |
| `destination` | `place` |
| `save_itinerary` | `create_events` |
| `get_trip_alerts` | `get_plan_warnings` |
| `skip_ai_generation` | not applicable; create events directly |

## Events

An event has `id`, `trip_id`, `day_id`, `title`, `kind`, `start`, `end`, `status` (`active` | `canceled`), and `conflict` (boolean) on list/get-day.

A day has `id`, `date`, and `notes`. Set notes with `update_day_notes`.
