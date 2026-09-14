export type LlmMessage = { role: "system" | "user"; content: string };

export type LlmClient = {
  complete: (messages: LlmMessage[]) => Promise<string>;
};

export function createLlmClient(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}): LlmClient | undefined {
  if (!opts.apiKey) {
    return undefined;
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async complete(messages) {
      const res = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          temperature: 0,
        }),
      });
      if (!res.ok) {
        throw new Error(`llm_http_${res.status}`);
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("llm_empty");
      }
      return content;
    },
  };
}
