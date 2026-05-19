import type {
  LLMProvider,
  SynthesisRequest,
  SynthesisChunk,
  SynthesisResult,
} from "./types";
// Prezzi Mistral al 2026-05 (USD per 1M token)
const PRICING: Record<string, { input: number; output: number }> = {
  "mistral-small-latest": { input: 0.10, output: 0.30 },
  "mistral-large-latest": { input: 0.50, output: 1.50 },
};

async function consumeOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (c: SynthesisChunk) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) onChunk({ text: delta });
        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
          outputTokens = parsed.usage.completion_tokens ?? outputTokens;
        }
      } catch {
        // ignora righe non parsabili
      }
    }
  }

  return { inputTokens, outputTokens };
}

export function createMistralProvider(apiKey: string): LLMProvider {
  return {
    id: "mistral",
    async synthesize(
      req: SynthesisRequest,
      model: string,
      onChunk: (c: SynthesisChunk) => void
    ): Promise<SynthesisResult> {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: "system", content: req.systemPrompt },
            {
              role: "user",
              content: req.notes
                ? `${req.transcript}\n\nNote manuali del partecipante:\n${req.notes}`
                : req.transcript,
            },
          ],
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Mistral error ${res.status}: ${errText}`);
      }

      const usage = await consumeOpenAIStream(res.body, onChunk);
      const price = PRICING[model] ?? { input: 0, output: 0 };
      const cost =
        (usage.inputTokens * price.input + usage.outputTokens * price.output) /
        1_000_000;

      return {
        usage: { ...usage, estimatedCostUsd: cost },
        modelUsed: model,
        providerUsed: "mistral",
      };
    },
  };
}