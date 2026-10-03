/** LLM provider factory. DeepSeek is the default; swap freely via env. */

import { createDeepSeek } from '@ai-sdk/deepseek'
import type { LanguageModel } from 'ai'

export interface ModelConfig {
  provider?: 'deepseek' | 'groq' | 'openai' | 'anthropic' | 'google'
  apiKey?: string
  model?: string
  baseURL?: string
}

export function createModel(config: ModelConfig = {}): LanguageModel {
  const provider = config.provider ?? (process.env.DEFAULT_LLM_PROVIDER as ModelConfig['provider']) ?? 'deepseek'

  if (provider === 'deepseek') {
    const deepseek = createDeepSeek({ apiKey: config.apiKey ?? process.env.DEEPSEEK_API_KEY, baseURL: config.baseURL })
    return deepseek(config.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat')
  }

  // Other providers are wired in the app layer to keep this package light.
  throw new Error(`Provider "${provider}" is not wired in @sps/agents yet.`)
}
