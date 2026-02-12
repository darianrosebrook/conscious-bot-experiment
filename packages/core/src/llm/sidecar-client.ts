/**
 * Sidecar LLM Client
 *
 * Minimal client for local MLX-LM sidecar server. Supports /api/generate and
 * OpenAI-compatible /v1/chat/completions when LLM_SIDECAR_OPENAI=truish.
 *
 * Env vars (precedence order):
 *   LLM_SIDECAR_URL  — canonical, full URL (e.g. http://localhost:5002)
 *   OLLAMA_HOST      — deprecated fallback (shared across packages)
 *   default          — http://localhost:5002
 *
 * BREAKING (2026-02-11): OLLAMA_BASE_URL is no longer accepted.
 * If your .env uses OLLAMA_BASE_URL, rename it to OLLAMA_HOST.
 *
 * Other env vars consumed:
 *   OLLAMA_MODEL           — default model name (default: llama3.1)
 *   LLM_SIDECAR_OPENAI     — '1'|'true' to use /v1/chat/completions
 *   OLLAMA_API_KEY          — bearer token for proxy auth
 */

export type SidecarLLMClientConfig = {
  baseUrl?: string; // e.g., http://localhost:5002
  model?: string; // e.g., llama3.1, qwen2.5, deepseek-r1, etc
  useOpenAICompat?: boolean; // use /v1/chat/completions
  apiKey?: string; // if using a proxy that needs auth
  defaultTemperature?: number;
  timeoutMs?: number;
};

/** @deprecated Use SidecarLLMClientConfig */
export type OllamaClientConfig = SidecarLLMClientConfig;

export class SidecarLLMClient {
  private baseUrl: string;
  private model: string;
  private useOpenAI: boolean;
  private apiKey?: string;
  private temperature: number;
  private timeoutMs: number;

  constructor(cfg: SidecarLLMClientConfig = {}) {
    this.baseUrl = cfg.baseUrl || process.env.LLM_SIDECAR_URL || process.env.OLLAMA_HOST || 'http://localhost:5002';
    this.model = cfg.model || process.env.OLLAMA_MODEL || 'llama3.1';
    const flag = (process.env.LLM_SIDECAR_OPENAI || process.env.OLLAMA_OPENAI || '').toLowerCase();
    this.useOpenAI = cfg.useOpenAICompat ?? (flag === '1' || flag === 'true');
    this.apiKey = cfg.apiKey || process.env.OLLAMA_API_KEY;
    this.temperature = cfg.defaultTemperature ?? 0.2;
    this.timeoutMs = cfg.timeoutMs ?? 20000;
  }

  async generate(options: {
    prompt: string;
    system?: string;
    temperature?: number;
    stop?: string[];
    maxTokens?: number;
  }): Promise<string> {
    return this.useOpenAI
      ? this.generateOpenAI(options)
      : this.generateNative(options);
  }

  private async generateNative(options: {
    prompt: string;
    system?: string;
    temperature?: number;
    stop?: string[];
    maxTokens?: number;
  }): Promise<string> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body: any = {
        model: this.model,
        prompt: options.system ? `${options.system}\n\n${options.prompt}` : options.prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? this.temperature,
          num_predict: options.maxTokens ?? undefined,
          stop: options.stop,
        },
      };
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Sidecar /api/generate HTTP ${res.status}: ${txt}`);
      }
      const json = (await res.json()) as any;
      if (typeof json?.response === 'string') return json.response;
      if (Array.isArray(json) && typeof json[0]?.response === 'string')
        return json[0].response;
      return JSON.stringify(json);
    } finally {
      clearTimeout(t);
    }
  }

  private async generateOpenAI(options: {
    prompt: string;
    system?: string;
    temperature?: number;
    stop?: string[];
    maxTokens?: number;
  }): Promise<string> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body = {
        model: this.model,
        messages: [
          options.system ? { role: 'system', content: options.system } : null,
          { role: 'user', content: options.prompt },
        ].filter(Boolean),
        temperature: options.temperature ?? this.temperature,
        stop: options.stop,
        max_tokens: options.maxTokens,
        stream: false,
      } as any;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Sidecar /v1/chat/completions HTTP ${res.status}: ${txt}`);
      }
      const json = (await res.json()) as any;
      const msg = json?.choices?.[0]?.message?.content;
      if (typeof msg === 'string') return msg;
      return JSON.stringify(json);
    } finally {
      clearTimeout(t);
    }
  }
}

/** @deprecated Use SidecarLLMClient */
export const OllamaClient = SidecarLLMClient;
