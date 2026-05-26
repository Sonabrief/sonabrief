import type {
  LLMProvider,
  SynthesisRequest,
  SynthesisChunk,
  SynthesisResult,
} from "./types";
import { consumeOpenAIStream } from "./stream";

// Prezzi Mistral al 2026-05 (USD per 1M token)
const PRICING: Record<string, { input: number; output: number }> = {
  "mistral-small-latest": { input: 0.10, output: 0.30 },
  "mistral-large-latest": { input: 0.50, output: 1.50 },
};

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
              content: (() => {
                const cleanTranscript = req.transcript.replace(/\n+/g, ' ').trim()
                return req.notes
                  ? `${cleanTranscript}\n\nNote manuali del partecipante:\n${req.notes}`
                  : cleanTranscript
              })(),
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