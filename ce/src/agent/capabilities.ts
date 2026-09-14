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

export const HOSTED_ALIAS_NAMES = ["list_trips", "create_trip", "ingest_confirmation"];
