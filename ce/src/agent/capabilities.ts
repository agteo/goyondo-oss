export const CAPABILITIES = [
  {
    name: "list_trips",
    description: "List trips on this Community Edition instance.",
    arguments: { type: "object", properties: {}, additionalProperties: false },
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
  create_trip: "Create trips in the CE UI (POST /api/ui/trips).",
  get_trip: "Use get_day with trip_id and day_id.",
  add_activity: "Use create_event.",
  update_activity: "Use move_event or cancel_event.",
  delete_activity: "Use cancel_event.",
  regenerate_itinerary: "Not available. Create events directly.",
  ingest_confirmation: "Use attach_document, then propose_from_documents and confirm_proposal.",
  list_itinerary_segments: "Not available. Use get_day.",
  update_day_notes: "Not available.",
};

// Hosted argument names that mean the agent is using goyondo.run docs against CE.
export const HOSTED_ARGUMENTS: Record<string, string> = {
  itinerary_id: "day_id",
  activity_id: "event_id",
  activity_type: "kind",
  skip_ai_generation: "(not applicable)",
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
  hosted_goyondo: {
    url: "https://goyondo.run",
    card_url: "https://goyondo.run/api/agent/card",
    token_prefix: "gyd_",
  },
} as const;
