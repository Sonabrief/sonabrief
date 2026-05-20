import type { SynthesisChunk } from "./types";

export async function consumeOpenAIStream(
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
      } catch { /* ignora righe non parsabili */ }
    }
  }
  return { inputTokens, outputTokens };
}
