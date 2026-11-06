// Claude API cost per call, from the token counts the API returns.
// Prices are US dollars per million tokens (Anthropic first-party rates).
// Cache writes (5-minute) cost 1.25x input. If the model declined and a fallback model answered,
// the response names that model and it is priced accordingly.

const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};
const DEFAULT_PRICE = PRICES["claude-opus-5-5"];

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function usageOf(response: { model?: string; usage?: UsageLike | null }): AiUsage {
  const u = response.usage ?? {};
  const model = response.model ?? "unknown";
  const price = PRICES[model] ?? DEFAULT_PRICE;
  const inputTokens = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
  const costUsd =
    (inputTokens * price.input + outputTokens * price.output + cacheReadTokens * price.cacheRead + cacheWriteTokens * price.input * 1.25) /
    1_000_000;
  return { model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}
