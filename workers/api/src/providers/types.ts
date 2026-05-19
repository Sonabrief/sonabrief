// Comune a tutti i provider LLM (Groq, Mistral, ...)

export type ProviderId = "mistral";

export type ModelTier = "free" | "pro" | "unlimited";

export interface SynthesisRequest {
  /** Prompt di sistema dal template scelto */
  systemPrompt: string;
  /** Trascrizione del meeting (input principale) */
  transcript: string;
  /** Lingua della sintesi attesa (it, en, fr, es, de) */
  language: string;
  /** Note manuali del partecipante (opzionale) */
  notes?: string;
}

export interface SynthesisChunk {
  /** Pezzo di testo emesso dal modello in streaming */
  text: string;
}

export interface SynthesisUsage {
  inputTokens: number;
  outputTokens: number;
  /** Costo stimato in USD (calcolato lato Worker dai prezzi noti) */
  estimatedCostUsd: number;
}

export interface SynthesisResult {
  usage: SynthesisUsage;
  modelUsed: string;
  providerUsed: ProviderId;
}

export interface LLMProvider {
  id: ProviderId;
  /**
   * Esegue la sintesi in streaming.
   * Emette chunk testuali via onChunk, ritorna metadata finali.
   */
  synthesize(
    req: SynthesisRequest,
    model: string,
    onChunk: (chunk: SynthesisChunk) => void
  ): Promise<SynthesisResult>;
}

/** Mapping tier → (provider preferito, modello) */
export interface TierRouting {
  primary: { provider: ProviderId; model: string };
  fallback?: { provider: ProviderId; model: string };
}

export const TIER_ROUTING: Record<ModelTier, TierRouting> = {
  free: {
    primary: { provider: "mistral", model: "mistral-small-latest" },
  },
  pro: {
    primary: { provider: "mistral", model: "mistral-small-latest" },
  },
  unlimited: {
    primary: { provider: "mistral", model: "mistral-small-latest" },
  },
};