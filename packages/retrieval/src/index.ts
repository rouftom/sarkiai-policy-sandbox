/**
 * Hybrid retrieval over the country-scoped knowledge base, backed by Qdrant.
 *
 * Pipeline (ITU-T Y.3172 "ML model" layer):
 *   1. embed the query (VoyageAI, input_type=query)
 *   2. prefetch dense (Voyage) + sparse (BM25) with the jurisdiction filter
 *   3. Qdrant native fusion (RRF) of both ranked lists
 *   4. optional rerank (Voyage rerank-2)
 *
 * If the Qdrant server has no sparse-inference model, we degrade gracefully to
 * dense-only search (same filter) — hybrid never blocks retrieval.
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import type { KbChunk, RetrievalQuery, Taxonomy } from '@sps/shared'

export interface RetrievalConfig {
  qdrantUrl: string
  qdrantApiKey?: string
  collectionName?: string
  denseVectorName?: string
  sparseVectorName?: string
  sparseModel?: string
  voyageApiKey: string
  embeddingModel?: string
  rerankModel?: string
}

interface QdrantPoint {
  id: string | number
  score?: number
  payload?: Record<string, unknown>
}

const DEFAULTS = {
  collectionName: 'policy_chunks',
  denseVectorName: 'dense',
  sparseVectorName: 'text',
  sparseModel: 'Qdrant/bm25',
  embeddingModel: 'voyage-4',
  rerankModel: 'rerank-2',
}

function buildFilter(query: RetrievalQuery) {
  const must: Array<Record<string, unknown>> = [
    { key: 'isActive', match: { value: true } },
    { key: 'country', match: { value: query.country } },
  ]
  if (query.jurisdiction) must.push({ key: 'jurisdiction', match: { value: query.jurisdiction } })
  if (query.docType) must.push({ key: 'docType', match: { value: query.docType } })
  if (query.namespace) must.push({ key: 'namespace', match: { value: query.namespace } })
  return { must }
}

async function embedQuery(config: RetrievalConfig, text: string): Promise<number[]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.voyageApiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: config.embeddingModel ?? DEFAULTS.embeddingModel,
      input_type: 'query',
    }),
  })
  if (!response.ok) throw new Error(`Voyage embed failed (${response.status}): ${await response.text()}`)
  const payload = (await response.json()) as { data: Array<{ embedding: number[] }> }
  const embedding = payload.data?.[0]?.embedding
  if (!embedding) throw new Error('Voyage returned no query embedding')
  return embedding
}

/** Reciprocal Rank Fusion — kept for callers that fuse lists locally. */
export function rrf<T>(lists: Array<{ items: T[]; weight: number }>, k = 60): Array<T & { score: number }> {
  const scores = new Map<string, { item: T; score: number }>()
  for (const { items, weight } of lists) {
    items.forEach((item, index) => {
      const key = JSON.stringify(item)
      const current = scores.get(key) ?? { item, score: 0 }
      current.score += weight / (k + index + 1)
      scores.set(key, current)
    })
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map(({ item, score }) => ({ ...item, score }))
}

function toChunk(point: QdrantPoint): KbChunk {
  const payload = (point.payload ?? {}) as Record<string, any>
  return {
    id: String(point.id),
    filename: payload.filename ?? '',
    text: payload.text ?? '',
    chunkIndex: payload.chunkIndex ?? 0,
    country: payload.country ?? '',
    jurisdiction: payload.jurisdiction ?? 'national',
    docType: payload.docType ?? payload.type ?? 'policy',
    pillar: payload.pillar,
    namespace: payload.namespace,
    version: payload.metadata?.version ?? payload.version,
    headingPath: payload.headingPath,
    articleNumber: payload.articleNumber,
    unitType: payload.unitType,
    chunkRole: payload.chunkRole,
    sourceUrl: payload.sourceUrl,
    score: point.score,
    isActive: payload.isActive !== false,
  }
}

export class PolicyRetriever {
  private client: QdrantClient
  private readonly cfg: Required<Pick<RetrievalConfig, 'collectionName' | 'denseVectorName' | 'sparseVectorName' | 'sparseModel' | 'embeddingModel' | 'rerankModel'>> &
    RetrievalConfig

  constructor(config: RetrievalConfig) {
    this.cfg = { ...DEFAULTS, ...config } as typeof this.cfg
    this.client = new QdrantClient({ url: this.cfg.qdrantUrl, apiKey: this.cfg.qdrantApiKey })
  }

  async search(query: RetrievalQuery): Promise<KbChunk[]> {
    const topK = query.topK ?? 8
    const dense = await embedQuery(this.cfg, query.text)
    const filter = buildFilter(query)

    let points: QdrantPoint[] = []
    try {
      // Hybrid: dense + BM25 sparse, fused server-side with RRF.
      points = (await this.client.query(this.cfg.collectionName, {
        prefetch: [
          { query: dense, using: this.cfg.denseVectorName, limit: topK * 3, filter },
          {
            query: { text: query.text, model: this.cfg.sparseModel } as unknown as number[],
            using: this.cfg.sparseVectorName,
            limit: topK * 3,
            filter,
          },
        ],
        query: { fusion: 'rrf' },
        limit: topK * 2,
        with_payload: true,
      })) as unknown as QdrantPoint[]
    } catch {
      // Dense-only fallback (no server-side sparse inference, etc.).
      points = (await this.client.search(this.cfg.collectionName, {
        vector: { name: this.cfg.denseVectorName, vector: dense },
        filter,
        limit: topK * 2,
        with_payload: true,
      })) as unknown as QdrantPoint[]
    }

    const chunks = points.map(toChunk)
    return this.rerank(query.text, chunks).slice(0, topK)
  }

  async upsert(points: Array<{ id: string; vector: Record<string, unknown>; payload: Taxonomy & Record<string, unknown> }>): Promise<void> {
    await this.client.upsert(this.cfg.collectionName, { points: points as never, wait: true })
  }

  private async rerank(query: string, chunks: KbChunk[]): Promise<KbChunk[]> {
    if (chunks.length <= 1) return chunks
    try {
      const response = await fetch('https://api.voyageai.com/v1/rerank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.voyageApiKey}`,
        },
        body: JSON.stringify({
          query,
          documents: chunks.map((c) => c.text),
          model: this.cfg.rerankModel,
          top_k: chunks.length,
        }),
      })
      if (!response.ok) return chunks
      const payload = (await response.json()) as { data: Array<{ index: number; relevance_score: number }> }
      return payload.data
        .map((row) => ({ ...chunks[row.index]!, score: row.relevance_score }))
        .filter(Boolean)
    } catch {
      return chunks
    }
  }
}
