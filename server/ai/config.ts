import { GoogleGenAI } from '@google/genai';

export interface AIConfig {
  model: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  maxPromptLength: number;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  model: process.env.AI_MODEL || 'gemini-3.8-flash',
  maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS) || 1024,
  temperature: 0.2, // Low temperature for high factual accuracy and reduced hallucination
  timeoutMs: 15000, // 15-second fail-closed timeout
  maxPromptLength: 2000, // Max 2,000 characters for user prompt
};

let genAIClient: GoogleGenAI | null = null;

/**
 * Returns lazy-initialized Google Gen AI SDK client.
 * Returns null if no GEMINI_API_KEY is configured in the environment.
 */
export function getGenAIClient(): GoogleGenAI | null {
  if (!genAIClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key.trim()) {
      genAIClient = new GoogleGenAI({ apiKey: key.trim() });
    }
  }
  return genAIClient;
}

/**
 * Calls Gemini with strict timeout and cost controls.
 * Falls back safely to deterministic grounded template engine when API key is unconfigured or in test mode.
 */
export async function callGeminiSafely(params: {
  systemInstruction?: string;
  prompt: string;
  config?: Partial<AIConfig>;
  mockFallbackGenerator?: () => string;
}): Promise<string> {
  const cfg = { ...DEFAULT_AI_CONFIG, ...params.config };
  const client = getGenAIClient();

  if (!client) {
    if (params.mockFallbackGenerator) {
      return params.mockFallbackGenerator();
    }
    return 'AI service is currently operating in offline mode. Please configure GEMINI_API_KEY on the server to enable real-time generative capabilities.';
  }

  // Enforce fail-closed timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('AI generation timed out after ' + cfg.timeoutMs + 'ms')), cfg.timeoutMs);
  });

  const apiPromise = (async () => {
    const response = await client.models.generateContent({
      model: cfg.model,
      contents: params.prompt,
      config: {
        systemInstruction: params.systemInstruction,
        maxOutputTokens: cfg.maxOutputTokens,
        temperature: cfg.temperature,
      },
    });
    return response.text || '';
  })();

  return await Promise.race([apiPromise, timeoutPromise]);
}
