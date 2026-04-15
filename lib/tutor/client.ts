// Tutor client speaks the OpenAI-compatible chat completions protocol.
// This lets us point at: Ollama (http://localhost:11434/v1), LM Studio,
// llama.cpp server, vLLM, or the real OpenAI/Anthropic via a proxy.
// Set TUTOR_BASE_URL and TUTOR_MODEL in .env.local.

import "server-only";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const baseUrl = process.env.TUTOR_BASE_URL ?? "http://localhost:11434/v1";
  const model = process.env.TUTOR_MODEL ?? "llama3.1:8b";
  const apiKey = process.env.TUTOR_API_KEY ?? "not-needed";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    throw new Error(`tutor backend ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message.content ?? "";
}
