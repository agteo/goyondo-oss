export type AppKeys = {
  weatherApiKey: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  sessionSecret: string;
};

export function loadKeys(env: NodeJS.ProcessEnv = process.env): AppKeys {
  return {
    weatherApiKey: env.WEATHER_API_KEY?.trim() ?? "",
    llmApiKey: env.LLM_API_KEY?.trim() ?? "",
    llmBaseUrl: (env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
    llmModel: env.LLM_MODEL?.trim() || "gpt-4o-mini",
    sessionSecret: env.SESSION_SECRET?.trim() || "dev-session-secret-change-me",
  };
}
