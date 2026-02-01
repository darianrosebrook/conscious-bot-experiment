/**
 * Recommended maxTokens and temperature per LLM call source.
 * Tuned for latency vs quality: lower maxTokens = faster MLX responses.
 *
 * @author @darianrosebrook
 */

export type LLMSource =
  | 'observation'
  | 'internal_thought'
  | 'social_response'
  | 'ethical_reasoning'
  | 'react_operational'
  | 'react_reflection'
  | 'intrusive_thought'
  | 'conversation_turn'
  | 'creative_solver'
  | 'theory_of_mind'
  | 'default';

export interface SourceLLMConfig {
  maxTokens: number;
  temperature: number;
}

/**
 * Ideal token limits per source (from benchmarking and latency targets).
 * Observation: short JSON thought + actions; 128 keeps latency low.
 * Internal thought / reflection: slightly longer.
 */
export const SOURCE_LLM_CONFIG: Record<LLMSource, SourceLLMConfig> = {
  observation: { maxTokens: 128, temperature: 0.35 },
  internal_thought: { maxTokens: 512, temperature: 0.8 },
  social_response: { maxTokens: 256, temperature: 0.8 },
  ethical_reasoning: { maxTokens: 1024, temperature: 0.6 },
  react_operational: { maxTokens: 500, temperature: 0.3 },
  react_reflection: { maxTokens: 300, temperature: 0.7 },
  intrusive_thought: { maxTokens: 512, temperature: 0.8 },
  conversation_turn: { maxTokens: 256, temperature: 0.4 },
  creative_solver: { maxTokens: 1024, temperature: 0.8 },
  theory_of_mind: { maxTokens: 512, temperature: 0.4 },
  default: { maxTokens: 512, temperature: 0.7 },
};

export function getLLMConfig(source: LLMSource): SourceLLMConfig {
  return SOURCE_LLM_CONFIG[source] ?? SOURCE_LLM_CONFIG.default;
}
