# Goyondo domain model

Agent-facing shape from `get_trip`. Capability **names** and **argument JSON schemas** are not defined here. Fetch `GET https://goyondo.run/api/agent/capabilities`.

There is no `Segment` type. Multi-city is one destination string.

Verified against the `api_version` stamped in [README.md](README.md).

```
Trip
  id, title, destination, start_date, end_date, travelers
  travel_style, accommodation_type, interests[]   # copied onto the trip at create
  itinerary
    days[]
      id              # UUID — this is itinerary_id for mutations
      day_number      # 1-based
      date            # YYYY-MM-DD
      notes
      activities[]
        id            # activity_id
        title
        activity_type
        start_time, end_time
        location, address
        …

User preferences (sibling of Trip, not nested under a day)
  travel_style, accommodation_type, interests, …
  Read with get_user_preferences before create_trip when personalizing.
```

**Day identity:** use `itinerary.days[n].id` as `itinerary_id` when adding or moving activities. Do not use `day_id` for placement. A call may succeed and still attach the activity to the wrong day.

**Activity types:** `general`, `sightseeing`, `dining`, `transport`, `accommodation`, `entertainment`, `shopping`, `outdoor`, `cultural`, `business`. Hotels are `accommodation`. Meals are `dining`. Flights and trains are `transport`.

**Multi-city:** join cities with space-arrow-space (`Paris, France → Rome, Italy`). Commas alone mean one destination.

**Create without AI itinerary:** pass `skip_ai_generation: true` on `create_trip` (what the examples do).

Taught capability names in this pack: `list_trips`, `create_trip`.
