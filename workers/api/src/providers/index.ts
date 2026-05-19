import type {
  LLMProvider,
  ModelTier,
  ProviderId,
  SynthesisChunk,
  SynthesisRequest,
  SynthesisResult,
} from "./types";
import { TIER_ROUTING } from "./types";
import { createMistralProvider } from "./mistral";

export interface ProviderEnv {
  MISTRAL_API_KEY: string;
}

export function buildProviders(env: ProviderEnv): Record<ProviderId, LLMProvider> {
  return {
    mistral: createMistralProvider(env.MISTRAL_API_KEY),
  };
}

export interface RoutingOutcome extends SynthesisResult {
  /** True se il provider primario è fallito e abbiamo usato il fallback */
  fellBackToSecondary: boolean;
  /** Errore del provider primario, se fallback è scattato */
  primaryError?: string;
}

/**
 * Esegue sintesi con routing tier-based e fallback automatico.
 * Lo streaming chiama onChunk per ogni pezzo di testo generato.
 */
export async function synthesizeWithRouting(
  tier: ModelTier,
  req: SynthesisRequest,
  env: ProviderEnv,
  onChunk: (c: SynthesisChunk) => void
): Promise<RoutingOutcome> {
  const providers = buildProviders(env);
  const routing = TIER_ROUTING[tier];

  // Tentativo primario
  try {
    const result = await providers[routing.primary.provider].synthesize(
      req,
      routing.primary.model,
      onChunk
    );
    return { ...result, fellBackToSecondary: false };
  } catch (primaryErr) {
    const primaryError =
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Nessun fallback definito → rilancia
    if (!routing.fallback) throw primaryErr;

    console.warn(
      `[router] Primary ${routing.primary.provider} failed (${primaryError}), trying fallback ${routing.fallback.provider}`
    );

    const result = await providers[routing.fallback.provider].synthesize(
      req,
      routing.fallback.model,
      onChunk
    );
    return { ...result, fellBackToSecondary: true, primaryError };
  }
}

// Re-export tipi pubblici
export type {
  LLMProvider,
  ModelTier,
  ProviderId,
  SynthesisChunk,
  SynthesisRequest,
  SynthesisResult,
} from "./types";