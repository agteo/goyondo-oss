export type WeatherStatus = "ok" | "unavailable";

export type WeatherDetails = {
  status: WeatherStatus;
  summary?: string;
  tempC?: number;
  place?: string;
  reason?: string;
};

export type WeatherFetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function fetchWeather(opts: {
  apiKey: string;
  place: string;
  fetchImpl?: WeatherFetcher;
}): Promise<WeatherDetails> {
  if (!opts.apiKey) {
    return { status: "unavailable", reason: "missing_key", place: opts.place };
  }
  const fetchImpl = opts.fetchImpl ?? (async (url) => {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status, json: () => res.json() };
  });
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(opts.place)}&appid=${encodeURIComponent(opts.apiKey)}&units=metric`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      return { status: "unavailable", reason: `http_${res.status}`, place: opts.place };
    }
    const body = (await res.json()) as {
      weather?: { description?: string }[];
      main?: { temp?: number };
    };
    return {
      status: "ok",
      summary: body.weather?.[0]?.description ?? "unknown",
      tempC: body.main?.temp,
      place: opts.place,
    };
  } catch {
    return { status: "unavailable", reason: "timeout_or_network", place: opts.place };
  }
}
