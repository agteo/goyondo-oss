export const CAPABILITIES = [
  {
    name: "list_trips",
    description: "List trips on this Community Edition instance. Optional limit; the result includes has_more.",
    arguments: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Maximum trips to return, from 1 to 100." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_trip",
    description:
      "Create a solo trip with empty days. Arguments are name, start_date, end_date, and place. This does not generate an itinerary.",
    arguments: {
      type: "object",
      required: ["name", "start_date", "end_date", "place"],
      properties: {
        name: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        place: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_days",
    description: "List the days of a trip, including day notes.",
    arguments: {
      type: "object",
      required: ["trip_id"],
      properties: { trip_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_day",
    description: "Get a day's events with conflict flags and weather when a weather key is configured.",
    arguments: {
      type: "object",
      required: ["trip_id", "day_id"],
      properties: {
        trip_id: { type: "string" },
        day_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_event",
    description: "Create an itinerary event on a day.",
    arguments: {
      type: "object",
      required: ["trip_id", "day_id", "title", "start", "end"],
      properties: {
        trip_id: { type: "string" },
        day_id: { type: "string" },
        title: { type: "string" },
        kind: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        notes: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "move_event",
    description: "Move an event in time and/or to another day.",
    arguments: {
      type: "object",
      required: ["event_id"],
      properties: {
        event_id: { type: "string" },
        day_id: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_events",
    description: "List active events for a trip as a flat array, with conflict flags.",
    arguments: {
      type: "object",
      required: ["trip_id"],
      properties: { trip_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "create_events",
    description:
      "Create many events in one call. Validates every event first; if any event is invalid, nothing is saved. Limits: 31 days, 20 events per day, 150 events per call. The result includes warnings.",
    arguments: {
      type: "object",
      required: ["trip_id", "days"],
      properties: {
        trip_id: { type: "string" },
        days: {
          type: "array",
          description: "Each item is { day_id, events: [{ title, start, end, kind?, notes? }] }.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_plan_warnings",
    description:
      "Read local plan warnings for a trip: overlapping times, duplicate titles on a day, and the same title on more than one day. No map or places lookup.",
    arguments: {
      type: "object",
      required: ["trip_id"],
      properties: { trip_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "update_day_notes",
    description: "Set or clear the notes on a day. Pass an empty string to clear them.",
    arguments: {
      type: "object",
      required: ["trip_id", "day_id", "notes"],
      properties: {
        trip_id: { type: "string" },
        day_id: { type: "string" },
        notes: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_document",
    description: "Read an attached document by document_id or by a filename substring.",
    arguments: {
      type: "object",
      required: ["trip_id"],
      properties: {
        trip_id: { type: "string" },
        document_id: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cancel_event",
    description: "Cancel an event. It remains stored with status canceled.",
    arguments: {
      type: "object",
      required: ["event_id"],
      properties: { event_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "attach_document",
    description: "Attach a document or instruction to a trip for later propose/confirm ingest.",
    arguments: {
      type: "object",
      required: ["trip_id"],
      properties: {
        trip_id: { type: "string" },
        filename: { type: "string" },
        text: { type: "string" },
        instruction: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "propose_from_documents",
    description: "Ask the LLM to propose events from stored documents. Does not apply them.",
    arguments: {
      type: "object",
      required: ["trip_id"],
      properties: { trip_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "confirm_proposal",
    description: "Apply a pending proposal's events after the operator confirms.",
    arguments: {
      type: "object",
      required: ["proposal_id"],
      properties: { proposal_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "reject_proposal",
    description: "Reject a pending proposal without writing events.",
    arguments: {
      type: "object",
      required: ["proposal_id"],
      properties: { proposal_id: { type: "string" } },
      additionalProperties: false,
    },
  },
] as const;

export const EDITION = "community";

// Hosted goyondo.run capabilities an agent may send here by mistake. `list_trips` is shared.
export const HOSTED_ONLY_CAPABILITIES: Record<string, string> = {
  get_trip: "Use list_days, then get_day. list_events returns the flat event list.",
  add_activity: "Use create_event.",
  update_activity: "Use move_event or cancel_event.",
  delete_activity: "Use cancel_event.",
  save_itinerary: "Use create_events.",
  regenerate_itinerary: "Not available. Create events directly.",
  ingest_confirmation: "Use attach_document, then propose_from_documents and confirm_proposal.",
  list_itinerary_segments: "Not available. Use list_events.",
  get_trip_alerts: "Use get_plan_warnings. CE checks overlaps and duplicates locally.",
};

// Hosted argument names that mean the agent is using goyondo.run docs against CE.
export const HOSTED_ARGUMENTS: Record<string, string> = {
  itinerary_id: "day_id",
  activity_id: "event_id",
  activity_type: "kind",
  destination: "place",
  skip_ai_generation: "(not applicable; create events with create_event or create_events)",
};

export const AGENT_CARD = {
  name: "Goyondo Community Edition",
  edition: EDITION,
  hosted: false,
  description:
    "Self-hosted travel harness. Not goyondo.run: capability names, argument names, and tokens differ.",
  token_prefix: "gce_",
  capability_registry_url: "/api/agent/capabilities",
  schema_url: "/api/agent/schema",
  task_url: "/api/agent/task",
  first_run: {
    first_capability: "list_trips",
    empty_list_is_success: true,
    token: "Sign in, then POST /agent-token. The gce_ token is shown once. There is no device-auth flow.",
  },
  hosted_goyondo: {
    url: "https://goyondo.run",
    card_url: "https://goyondo.run/api/agent/card",
    token_prefix: "gyd_",
  },
} as const;
