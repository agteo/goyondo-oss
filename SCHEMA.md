# Goyondo domain model

Agent-facing shape from `get_trip`. Capability **names** and **argument JSON schemas** are not defined here. Fetch `GET https://goyondo.run/api/agent/capabilities`.

Multi-city is one destination string, not a list of legs.

Verified against the `api_version` stamped in [README.md](README.md).

```
Trip
  id, title, destination, start_date, end_date, travelers
  travel_style, accommodation_type, interests[]   # copied onto the trip at create
  dietary_restrictions[]
  children                                     # { infants, children, teens }; omit when there are none
  origin                                       # where the trip starts; omit to use home base
  journey                                      # estimate: flight hours, timezone difference, long-haul, jet lag
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
        metadata.overnight_transport   # true only for transport that crosses midnight
                                       # and is the overnight plan
        …

Segments (sibling of itinerary, business-travel bookings)
  flights, hotels, car rentals, meetings
  Read with list_itinerary_segments(trip_id).
  Not returned inside get_trip itinerary days.

User preferences (sibling of Trip, not nested under a day)
  travel_style, accommodation_type, interests, dietary_restrictions, …
  default_children                             # same shape as trip.children; default for new plans
  home_base                                    # read-only for agents; null if unset
  Read with get_user_preferences before create_trip when personalizing.
```

**Day identity:** use `itinerary.days[n].id` as `itinerary_id` when adding or moving activities. Do not use `day_id` for placement. A call may succeed and still attach the activity to the wrong day.

**Activity types:** `general`, `sightseeing`, `dining`, `transport`, `accommodation`, `entertainment`, `shopping`, `outdoor`, `cultural`, `business`. Hotels are `accommodation`. Meals are `dining`. Flights and trains are `transport`.

**Family composition:** `children` on `create_trip` and `update_trip` is `{ infants, children, teens }`. The three counts together must leave at least one adult in `travelers`. `update_user_preferences` stores the same shape as `default_children`. `dietary_restrictions` can be set on the trip or on preferences.

**Overnight transit:** set `metadata.overnight_transport` to `true` on `add_activity`, `update_activity`, or a `save_itinerary` activity only when that transport crosses midnight and is the overnight plan. Other metadata keys are rejected. Do not also add a hotel for that night unless the user has one.

**Origin:** `trip.origin` is where the traveler starts. Omit it on `create_trip` to use the saved home base. Pass `origin` only when the user says where they start. Setting it does not change the home base. `trip.journey` is an estimate (flight hours, timezone difference, long-haul, jet lag). Describe it as approximate.

**Home base:** `get_user_preferences` returns `home_base` (`city`, `country`, `airport_iata`) or `null`. Agents cannot write it. `update_user_preferences` with `home_base` returns `confirmation_required` and a `confirm_url`. Give that link to the user. Nothing is saved until they confirm it in the app.

**Segments vs activities:** a segment is a stored booking record (flight, hotel, car rental, meeting). An activity is an itinerary entry on a day. A flight can exist as a segment without a `transport` activity. Check `list_itinerary_segments` before adding a duplicate activity for something already booked. Confirmation import is not a published capability.

**Multi-city:** join cities with space-arrow-space (`Paris, France → Rome, Italy`). Commas alone mean one destination.

**Create without AI itinerary:** pass `skip_ai_generation: true` on `create_trip` (what the examples do). That creates empty days and does not use the AI trip allowance. Fill them with `save_itinerary` (append-only: call `get_trip` first and do not resend activities already stored). Activity writes can succeed and still return `warnings` for duplicates or overlaps.

Taught capability names in this pack: `list_trips`, `create_trip`.
