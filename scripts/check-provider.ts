#!/usr/bin/env bun
/**
 * Pre-flight check for the local inference plane.
 *
 *   bun scripts/check-provider.ts
 *
 * Verifies the three services the engine cannot work without:
 *   - Ollama answers on `OLLAMA_BASE_URL`;
 *   - the chat model (`OLLAMA_MODEL`) is pulled;
 *   - the embedding model (`EMBEDDING_MODEL`) returns a vector;
 *   - Qdrant answers on `QDRANT_URL`.
 *
 * Exit code 0 when everything is ready, 1 otherwise. No network call leaves the
 * host: only the configured local endpoints are contacted.
 */

const ollama = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
const qdrant = (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/$/, '')
const chatModel = process.env.OLLAMA_MODEL || 'qwen3.5:9b'
const embeddingModel = process.env.EMBEDDING_MODEL || 'bge-m3'
const collection = process.env.QDRANT_COLLECTION || 'policy_chunks'

let failures = 0

function line(ok: boolean, label: string, detail: string): void {
  const mark = ok ? 'ok  ' : 'FAIL'
  console.log(`[${mark}] ${label.padEnd(22)} ${detail}`)
  if (!ok) failures += 1
}

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function main(): Promise<void> {
  console.log('Checking the local inference plane\n')

  // Ollama
  try {
    const tags = (await json(`${ollama}/api/tags`)) as { models?: Array<{ name: string }> }
    const names = (tags.models ?? []).map((model) => model.name)
    line(true, 'Ollama', `${ollama} (${names.length} model${names.length === 1 ? '' : 's'} pulled)`)

    const hasChat = names.some((name) => name === chatModel || name.startsWith(`${chatModel}:`))
    line(hasChat, `Chat model`, `${chatModel}${hasChat ? '' : ' is not pulled (run: ollama pull ' + chatModel + ')'}`)

    const hasEmbedding = names.some((name) => name === embeddingModel || name.startsWith(`${embeddingModel}:`))
    line(
      hasEmbedding,
      `Embedding model`,
      `${embeddingModel}${hasEmbedding ? '' : ' is not pulled (run: ollama pull ' + embeddingModel + ')'}`,
    )

    if (hasEmbedding) {
      try {
        const body = (await json(`${ollama}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: embeddingModel, input: 'souveraineté numérique' }),
        })) as { embeddings?: number[][] }
        const size = body.embeddings?.[0]?.length ?? 0
        line(size === 1024, 'Embedding dimension', `${size} (expected 1024 for bge-m3)`)
      } catch (error) {
        line(false, 'Embedding call', (error as Error).message)
      }
    }
  } catch (error) {
    line(false, 'Ollama', `${ollama} unreachable: ${(error as Error).message}`)
    line(false, 'Chat model', 'not checked')
    line(false, 'Embedding model', 'not checked')
  }

  // Qdrant
  try {
    const info = (await json(`${qdrant}/collections/${encodeURIComponent(collection)}`)) as {
      result?: { points_count?: number; config?: { params?: { vectors?: Record<string, { size?: number }> } } }
    }
    const points = info.result?.points_count ?? 0
    const vectors = info.result?.config?.params?.vectors
    const size = vectors ? Object.values(vectors)[0]?.size : undefined
    line(true, 'Qdrant', `${qdrant} · collection "${collection}" · ${points} points`)
    if (size !== undefined) {
      line(size === 1024, 'Vector size', `${size} (expected 1024; reindex if different)`)
    }
  } catch (error) {
    line(false, 'Qdrant', `${qdrant} · collection "${collection}": ${(error as Error).message}`)
  }

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log('Local inference plane ready.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
