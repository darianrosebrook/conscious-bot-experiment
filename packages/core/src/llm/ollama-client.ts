/**
 * Ollama LLM Client
 *
 * Minimal client for local Ollama server. Supports /api/generate and
 * OpenAI-compatible /v1/chat/completions when OLLAMA_OPENAI=truish.
 */

export type OllamaClientConfig = {
  baseUrl?: string; // e.g., http://localhost:5002
  model?: string; // e.g., llama3.1, qwen2.5, deepseek-r1, etc
  useOpenAICompat?: boolean; // use /v1/chat/completions
  apiKey?: string; // if using a proxy that needs auth
  defaultTemperature?: number;
  timeoutMs?: number;
};

export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private useOpenAI: boolean;
  private apiKey?: string;
  private temperature: number;
  private timeoutMs: number;

  constructor(cfg: OllamaClientConfig = {}) {
    this.baseUrl = cfg.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:5002';
    this.model = cfg.model || process.env.OLLAMA_MODEL || 'llama3.1';
    const flag = (process.env.OLLAMA_OPENAI || '').toLowerCase();
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
      : this.generateOllama(options);
  }

  private async generateOllama(options: {
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
        throw new Error(`Ollama /api/generate HTTP ${res.status}: ${txt}`);
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
        throw new Error(`Ollama /v1/chat/completions HTTP ${res.status}: ${txt}`);
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

