// Zhipu AI (智谱) API wrapper — uses the OpenAI-compatible chat completions endpoint.
// Docs: https://open.bigmodel.cn/dev/api

const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export interface CallZhipuOptions {
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: "json_object" | "text";
  temperature?: number;
  maxTokens?: number;
  // GLM-4.5+ models have a "thinking" mode that emits long reasoning before content.
  // For structured-output tasks this is expensive and slow, so we disable it by default.
  thinking?: "enabled" | "disabled";
}

export interface CallZhipuResult {
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usage: any;
}

export async function callZhipu(options: CallZhipuOptions): Promise<CallZhipuResult> {
  const {
    systemPrompt,
    userPrompt,
    responseFormat = "text",
    temperature = 0.3,
    maxTokens = 4000,
    thinking = "disabled",
  } = options;

  const apiKey = process.env.ZHIPU_API_KEY;
  const model = process.env.ZHIPU_MODEL || "glm-4.6";

  if (!apiKey) {
    throw new Error("ZHIPU_API_KEY is not set. Please configure it in .env.local.");
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
    thinking: { type: thinking },
  };

  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const doRequest = async (): Promise<Response> => {
    return fetch(`${ZHIPU_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  };

  let response: Response;
  try {
    response = await doRequest();
  } catch (networkErr) {
    // Retry once on network-level failure (fetch throws only for network errors).
    try {
      response = await doRequest();
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(`Zhipu API network error after retry: ${msg}`);
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // 4xx → do not retry; surface the error to the caller.
    throw new Error(
      `Zhipu API error ${response.status} ${response.statusText}: ${errText}`
    );
  }

  const data = await response.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return { content, usage: data?.usage };
}
