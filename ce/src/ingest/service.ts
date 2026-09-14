import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EventStore } from "../db/store.ts";
import type { LlmClient } from "../llm/adapter.ts";
import type { EventKind } from "../domain/types.ts";

const INGEST_SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  instruction TEXT,
  extracted_text TEXT
);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL
);
`;

export type ProposalStatus = "proposed" | "applied" | "rejected" | "failed_parse";

export type ProposedEvent = {
  dayId: string;
  title: string;
  kind: EventKind;
  start: string;
  end: string;
};

export class IngestService {
  constructor(
    private readonly store: EventStore,
    private readonly filesRoot: string,
  ) {
    this.store.db.exec(INGEST_SCHEMA);
  }

  attach(opts: {
    tripId: string;
    filename: string;
    bytes?: Buffer;
    text?: string;
    instruction?: string;
  }): { id: string; storedPath: string } {
    mkdirSync(join(this.filesRoot, opts.tripId), { recursive: true });
    const id = randomUUID();
    const storedPath = join(this.filesRoot, opts.tripId, `${id}-${opts.filename}`);
    writeFileSync(storedPath, opts.bytes ?? Buffer.from(opts.text ?? "", "utf8"));
    this.store.db
      .prepare(
        `INSERT INTO documents (id, trip_id, filename, stored_path, instruction, extracted_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, opts.tripId, opts.filename, storedPath, opts.instruction ?? null, opts.text ?? null);
    return { id, storedPath };
  }

  list(tripId: string) {
    return this.store.db
      .prepare(
        "SELECT id, trip_id AS tripId, filename, stored_path AS storedPath, instruction, extracted_text AS extractedText FROM documents WHERE trip_id = ?",
      )
      .all(tripId);
  }

  async propose(tripId: string, llm: LlmClient | undefined): Promise<{
    id: string;
    status: ProposalStatus;
    events: ProposedEvent[];
    error?: string;
  }> {
    if (!llm) {
      const id = randomUUID();
      this.saveProposal(id, tripId, "failed_parse", []);
      return { id, status: "failed_parse", events: [], error: "missing_llm_key" };
    }
    const docs = this.list(tripId) as {
      filename: string;
      instruction: string | null;
      extractedText: string | null;
    }[];
    const days = this.store.listDays(tripId);
    try {
      const raw = await llm.complete([
        {
          role: "system",
          content:
            "Return JSON only: {\"events\":[{\"dayId\",\"title\",\"kind\",\"start\",\"end\"}]}. kind is flight|hotel|meal|activity|transfer|other. Use dayId from the provided days.",
        },
        {
          role: "user",
          content: JSON.stringify({ days, documents: docs }),
        },
      ]);
      const parsed = JSON.parse(extractJson(raw)) as { events?: ProposedEvent[] };
      const events = Array.isArray(parsed.events) ? parsed.events : [];
      const id = randomUUID();
      this.saveProposal(id, tripId, "proposed", events);
      return { id, status: "proposed", events };
    } catch (err) {
      const id = randomUUID();
      this.saveProposal(id, tripId, "failed_parse", []);
      return { id, status: "failed_parse", events: [], error: String(err) };
    }
  }

  confirm(proposalId: string): { status: ProposalStatus; applied: number } {
    const row = this.getProposal(proposalId);
    if (!row || row.status !== "proposed") {
      throw new Error("proposal_not_confirmable");
    }
    const events = JSON.parse(row.payload) as ProposedEvent[];
    for (const event of events) {
      this.store.createEvent({
        tripId: row.trip_id,
        dayId: event.dayId,
        title: event.title,
        kind: event.kind,
        start: event.start,
        end: event.end,
      });
    }
    this.store.db.prepare("UPDATE proposals SET status = ? WHERE id = ?").run("applied", proposalId);
    return { status: "applied", applied: events.length };
  }

  reject(proposalId: string): { status: ProposalStatus } {
    const row = this.getProposal(proposalId);
    if (!row || row.status !== "proposed") {
      throw new Error("proposal_not_rejectable");
    }
    this.store.db.prepare("UPDATE proposals SET status = ? WHERE id = ?").run("rejected", proposalId);
    return { status: "rejected" };
  }

  private saveProposal(id: string, tripId: string, status: ProposalStatus, events: ProposedEvent[]): void {
    this.store.db
      .prepare("INSERT INTO proposals (id, trip_id, status, payload) VALUES (?, ?, ?, ?)")
      .run(id, tripId, status, JSON.stringify(events));
  }

  private getProposal(id: string) {
    return this.store.db
      .prepare("SELECT id, trip_id, status, payload FROM proposals WHERE id = ?")
      .get(id) as { id: string; trip_id: string; status: ProposalStatus; payload: string } | undefined;
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("no_json");
  }
  return text.slice(start, end + 1);
}
