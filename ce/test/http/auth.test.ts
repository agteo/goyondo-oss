import { describe, expect, it } from "vitest";
import { EventStore } from "../../src/db/store.ts";
import { AuthService } from "../../src/http/auth.ts";
import { loadKeys } from "../../src/http/keys.ts";

describe("AuthService", () => {
  it("rejects a second operator registration (AE7)", () => {
    const store = new EventStore();
    const auth = new AuthService(store.db);
    expect(auth.register("alex", "secret").ok).toBe(true);
    const second = auth.register("other", "secret");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(403);
    }
    store.close();
  });

  it("rejects an unknown bearer token", () => {
    const store = new EventStore();
    const auth = new AuthService(store.db);
    auth.register("alex", "secret");
    expect(auth.authenticateBearer("gce_not_a_token")).toBe(false);
    store.close();
  });

  it("mints a one-time-reveal token, stores only a hash, and revokes the previous token", () => {
    const store = new EventStore();
    const auth = new AuthService(store.db);
    auth.register("alex", "secret");
    const first = auth.mintAgentToken();
    expect(first.startsWith("gce_")).toBe(true);
    expect(auth.authenticateBearer(first)).toBe(true);
    expect(auth.tokenPlaintextPersisted(first)).toBe(false);
    const second = auth.mintAgentToken();
    expect(auth.authenticateBearer(first)).toBe(false);
    expect(auth.authenticateBearer(second)).toBe(true);
    store.close();
  });

  it("logs in the operator with a session", () => {
    const store = new EventStore();
    const auth = new AuthService(store.db);
    auth.register("alex", "secret");
    expect(auth.login("alex", "wrong")).toBeUndefined();
    const session = auth.login("alex", "secret");
    expect(session).toBeTruthy();
    expect(auth.operatorFromSession(session)).toBeTruthy();
    store.close();
  });
});

describe("loadKeys", () => {
  it("boots with neither weather nor LLM key", () => {
    const keys = loadKeys({});
    expect(keys.weatherApiKey).toBe("");
    expect(keys.llmApiKey).toBe("");
  });
});
