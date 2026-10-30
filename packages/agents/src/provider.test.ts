import { describe, expect, test } from 'bun:test'
import {
  createModel,
  defaultChatModel,
  describeProvider,
  envValue,
  listProviderModels,
  ollamaRoot,
  parseOllamaModels,
  resolveProvider,
  withV1,
} from './index'

/** A clean, empty environment: nothing is configured unless stated. */
const base: Record<string, string | undefined> = {}

describe('provider layer · local only', () => {
  test('defaults to the local Ollama server', () => {
    const descriptor = resolveProvider(base)
    expect(descriptor.mode).toBe('local')
    expect(descriptor.servedBy).toBe('Ollama')
    expect(descriptor.residency).toBe('on-premise')
    expect(descriptor.openWeights).toBe(true)
    expect(descriptor.models.reasoning).toBe('qwen3.5:9b')
    expect(descriptor.models.embedding).toBe('bge-m3')
    expect(descriptor.budgetUsd).toBe(0)
    expect(descriptor.ready).toBe(true)
  })

  test('there is no mode switch: cloud variables are ignored', () => {
    const descriptor = resolveProvider({
      SANDBOX_MODE: 'cloud',
      MODEL_API_KEY: 'super-secret-key',
      META_BASE_URL: 'https://api.meta.ai/v1',
    })
    expect(descriptor.mode).toBe('local')
    expect(descriptor.servedBy).toBe('Ollama')
    expect(JSON.stringify(descriptor)).not.toContain('super-secret-key')
    expect(JSON.stringify(descriptor)).not.toContain('api.meta.ai')
  })

  test('reads the configured model and embedding model', () => {
    const descriptor = resolveProvider({ OLLAMA_MODEL: 'qwen2.5:14b', EMBEDDING_MODEL: 'bge-m3' })
    expect(descriptor.models.reasoning).toBe('qwen2.5:14b')
    expect(descriptor.models.vision).toBe('qwen2.5:14b')
  })

  test('accepts inline comments and quotes, as found in .env files', () => {
    expect(envValue({ OLLAMA_MODEL: 'qwen3.5:9b   # local model' }, 'OLLAMA_MODEL')).toBe('qwen3.5:9b')
    expect(envValue({ OLLAMA_MODEL: '"qwen3.5:9b"' }, 'OLLAMA_MODEL')).toBe('qwen3.5:9b')
    expect(envValue({ OLLAMA_MODEL: '' }, 'OLLAMA_MODEL', 'fallback')).toBe('fallback')
  })

  test('base URLs are normalised to /v1 for the client and stripped for the native API', () => {
    expect(withV1('http://ollama:11434/')).toBe('http://ollama:11434/v1')
    expect(withV1('http://ollama:11434/v1')).toBe('http://ollama:11434/v1')
    expect(ollamaRoot('http://ollama:11434/v1')).toBe('http://ollama:11434')
    expect(resolveProvider({ OLLAMA_BASE_URL: 'http://ollama:11434/' }).baseURL).toBe('http://ollama:11434/v1')
  })

  test('createModel resolves without a network call', () => {
    const model = createModel()
    expect(typeof model).toBe('object')
    expect(model).not.toBeNull()
  })

  test('createModel keeps the explicit-endpoint form', () => {
    const model = createModel({ baseURL: 'http://localhost:11434', model: 'qwen3.5:9b' })
    expect(model).toBeDefined()
  })

  test('describeProvider is a one-line mode · model summary', () => {
    expect(describeProvider(resolveProvider(base))).toBe('local · qwen3.5:9b')
  })
})

describe('Ollama model list', () => {
  test('parses /api/tags, deduplicates and sorts', () => {
    const models = parseOllamaModels({
      models: [
        { name: 'qwen3.5:9b', model: 'qwen3.5:9b' },
        { name: 'bge-m3:latest' },
        { name: 'qwen3.5:9b' },
        {},
      ],
    })
    expect(models.map((model) => model.id)).toEqual(['bge-m3:latest', 'qwen3.5:9b'])
    expect(models[0]?.ownedBy).toBe('Ollama')
    expect(parseOllamaModels({ models: 'nope' })).toEqual([])
    expect(parseOllamaModels(null)).toEqual([])
  })

  test('defaultChatModel keeps the first entry of the sorted list', () => {
    expect(defaultChatModel([{ id: 'bge-m3' }, { id: 'qwen3.5:9b' }])?.id).toBe('bge-m3')
    expect(defaultChatModel([])).toBeUndefined()
  })

  test('listProviderModels calls the native /api/tags endpoint', async () => {
    let url = ''
    const descriptor = resolveProvider({ OLLAMA_BASE_URL: 'http://ollama:11434' })
    const models = await listProviderModels(descriptor, base, (async (input: string | URL | Request) => {
      url = String(input)
      return new Response(JSON.stringify({ models: [{ name: 'qwen3.5:9b' }] }), { status: 200 })
    }) as unknown as typeof fetch)
    expect(url).toBe('http://ollama:11434/api/tags')
    expect(models.map((model) => model.id)).toEqual(['qwen3.5:9b'])
  })
})
