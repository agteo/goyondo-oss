import { describe, expect, it } from "vitest";
import { fetchWeather } from "../../src/weather/adapter.ts";

describe("fetchWeather", () => {
  it("returns unavailable when the key is missing", async () => {
    const result = await fetchWeather({ apiKey: "", place: "Lisbon" });
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("missing_key");
  });

  it("maps provider JSON on success", async () => {
    const result = await fetchWeather({
      apiKey: "k",
      place: "Lisbon",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ weather: [{ description: "clear sky" }], main: { temp: 22 } }),
      }),
    });
    expect(result).toMatchObject({ status: "ok", summary: "clear sky", tempC: 22 });
  });

  it("returns unavailable on 401", async () => {
    const result = await fetchWeather({
      apiKey: "bad",
      place: "Lisbon",
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    });
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("http_401");
  });
});
