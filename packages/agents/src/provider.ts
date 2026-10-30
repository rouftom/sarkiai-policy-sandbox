/**
 * Provider layer: one inference backend, on-premise.
 *
 * Every model call goes to a local Ollama server through its OpenAI-compatible
 * `/v1` endpoint. Nothing leaves the machine: there is no mode switch, no API
 * key and no hosted fallback. The descriptor below is what the console shows in
 * its provider badge, so an operator can verify where the work happens.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { ProviderDescriptor } from '@sps/shared'

type Env = Record<string, string | undefined>

/** Read an env var, stripping inline comments, surrounding quotes and blanks. */
export function envValue(source: Env, name: string, fallback = ''): string {
  const raw = source[name]
  if (raw === undefined) return fallback
  const value = raw
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim()
  return value || fallback
}

/** OpenAI-compatible clients expect the `/v1` suffix on the base URL. */
export function withV1(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  return base.endsWith('/v1') ? base : `${base}/v1`
}

/** The Ollama API root (`/api/tags`, `/api/embed`), without the `/v1` suffix. */
export function ollamaRoot(baseURL: string): string {
  return baseURL.replace(/\/+$/, '').replace(/\/v1$/, '')
}

/**
 * Describe the active provider without exposing anything secret.
 *
 * The descriptor keeps the `mode` field so the console and the audit trail use
 * one vocabulary; it is always `local` here.
 */
export function resolveProvider(source: Env = process.env): ProviderDescriptor {
  const model = envValue(source, 'OLLAMA_MODEL', 'qwen3.5:9b')
  return {
    mode: 'local',
    label: 'Local',
    servedBy: 'Ollama',
    baseURL: withV1(envValue(source, 'OLLAMA_BASE_URL', 'http://localhost:11434')),
    models: {
      reasoning: model,
      vision: model,
      embedding: envValue(source, 'EMBEDDING_MODEL', 'bge-m3'),
    },
    residency: 'on-premise',
    openWeights: true,
    budgetUsd: 0,
    ready: true,
  }
}

/** Ollama accepts any string as a key; the OpenAI-compatible client requires one. */
export function providerApiKey(): string {
  return 'ollama'
}

/** How to call the provider from this process. */
export function providerAccess(_descriptor?: ProviderDescriptor): { apiKey: string; headers: Record<string, string> } {
  return { apiKey: providerApiKey(), headers: {} }
}

/** Build the chat model for a descriptor (lazy: no network call happens here). */
export function createProviderModel(descriptor: ProviderDescriptor): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: descriptor.baseURL,
    apiKey: providerApiKey(),
  })
  return provider.chatModel(descriptor.models.reasoning)
}

export interface ProviderModelInfo {
  id: string
  ownedBy?: string
}

/** Ollama `/api/tags` → the model list the console offers. */
export function parseOllamaModels(payload: unknown): ProviderModelInfo[] {
  const rows = (payload as { models?: unknown })?.models
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const out: ProviderModelInfo[] = []
  for (const row of rows) {
    const entry = row as { name?: unknown; model?: unknown }
    const id = typeof entry.name === 'string' ? entry.name : typeof entry.model === 'string' ? entry.model : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, ownedBy: 'Ollama' })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** Ask the local server which models are pulled. */
export async function listProviderModels(
  descriptor: ProviderDescriptor,
  source: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderModelInfo[]> {
  const response = await fetchImpl(`${ollamaRoot(descriptor.baseURL || envValue(source, 'OLLAMA_BASE_URL', 'http://localhost:11434'))}/api/tags`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Local model list failed (${response.status}).`)
  return parseOllamaModels(await response.json())
}

/** The configured model is the default; the rest of the list is the operator's choice. */
export function defaultChatModel(models: ProviderModelInfo[]): ProviderModelInfo | undefined {
  return models[0]
}

/** One-line, secret-free summary used in logs, the API and the UI badge. */
export function describeProvider(descriptor: ProviderDescriptor): string {
  return `${descriptor.mode} · ${descriptor.models.reasoning}`
}
