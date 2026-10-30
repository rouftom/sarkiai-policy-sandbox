/**
 * LLM handle factory.
 *
 * Models are served by the local Ollama server through its OpenAI-compatible
 * endpoint (`/v1`); nothing leaves the machine. This module is the short entry
 * point used by the engine:
 *
 *   createModel()                        → the provider described by the env
 *   createModel({ baseURL, model })      → an explicit local endpoint
 */

import type { LanguageModel } from 'ai'
import type { ProviderDescriptor } from '@sps/shared'
import { createProviderModel, resolveProvider, withV1 } from './provider'

export interface ModelConfig {
  /** Ollama base URL, e.g. http://ollama:11434 (the `/v1` suffix is added). */
  baseURL?: string
  /** Model tag, e.g. qwen3.5:9b. */
  model?: string
  /** Reuse an already-resolved descriptor instead of reading the environment. */
  provider?: ProviderDescriptor
}

export function createModel(config: ModelConfig = {}): LanguageModel {
  const descriptor =
    config.provider ??
    (config.baseURL || config.model ? explicitLocal(config) : resolveProvider(process.env))
  return createProviderModel(descriptor)
}

/** An explicitly configured OpenAI-compatible endpoint (local development). */
function explicitLocal(config: ModelConfig): ProviderDescriptor {
  const baseURL = withV1(config.baseURL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434')
  const model = config.model ?? process.env.OLLAMA_MODEL ?? 'qwen3.5:9b'
  return {
    mode: 'local',
    label: 'Local',
    servedBy: 'Ollama',
    baseURL,
    models: { reasoning: model, vision: model, embedding: process.env.EMBEDDING_MODEL ?? 'bge-m3' },
    residency: 'on-premise',
    openWeights: true,
    budgetUsd: 0,
    ready: true,
  }
}
