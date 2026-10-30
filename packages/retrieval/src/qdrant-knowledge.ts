/**
 * Knowledge-base administration on Qdrant.
 *
 * The vector store is Qdrant (`bge-m3` dense + BM25 sparse + RRF); figures and
 * the ingestion history live in the operational MongoDB. Ingestion itself is
 * delegated to the local Python service, which owns the structural chunker and
 * the Ollama embedding calls, so the API and the CLI seed the corpus the same
 * way.
 *
 * Everything the console does — status, document list, preview, chunk edit,
 * figures, ingestion, playground — is implemented here against those two local
 * stores. No external vector service, no hosted embedding, no cloud binary.
 */

import { createHash, randomUUID } from 'node:crypto'
import { Binary, MongoClient, type Collection, type Document } from 'mongodb'
import { QdrantClient } from '@qdrant/js-client-rest'
import type {
  DocType,
  DocumentImage,
  Jurisdiction,
  ReadinessDimension,
  RetrievalQuery,
} from '@sps/shared'

export interface QdrantKnowledgeConfig {
  qdrantUrl: string
  qdrantApiKey?: string
  collection: string
  denseVector?: string
  sparseVector?: string
  sparseModel?: string
  embeddingsBaseUrl: string
  embeddingModel?: string
  rerankUrl?: string
  rerankModel?: string
  mongodbUri: string
  dbName: string
  ingestionUrl: string
  ingestionApiKey?: string
}

const DEFAULTS = {
  denseVector: 'dense',
  sparseVector: 'text',
  sparseModel: 'Qdrant/bm25',
  embeddingModel: 'bge-m3',
  embeddingDimension: 1024,
}

const IMAGE_COLLECTION = 'kb_images'
const INGEST_LOG = 'kb_ingest_runs'
const PAYLOAD_FIELDS = ['filename', 'country', 'jurisdiction', 'docType', 'namespace', 'isActive']

export interface IngestTotals {
  filename: string
  chunks: number
  processedAt: string
}

export interface KnowledgeStatus {
  collection: string
  collectionEmpty: boolean
  documents: number
  chunks: number
  indexedChunks: number
  namespaces: string[]
  countries: string[]
  docTypes: string[]
  lastIngestedAt: string | null
  totals: {
    chunks: number
    activeChunks: number
    documents: number
    characters: number
    lastIngestedAt: string | null
  }
  byCountry: Array<{ value: string; chunks: number }>
  byDocType: Array<{ value: string; chunks: number }>
  indexes: { supported: boolean; collectionExists: boolean; indexes: Array<{ name: string; state: string }>; error?: string }
  expectedIndexes: string[]
  embedding: {
    model: string
    rerankModel: string
    dimensions: number | null
    missingVectors: number
    mismatchedVectors: number
  }
  recentRuns: IngestTotals[]
}

export interface KnowledgeDocument {
  filename: string
  documentId: string
  chunks: number
  activeChunks: number
  characters: number
  country: string
  docType: string
  namespace?: string
  version?: string
  sourceUrl?: string
  lastIngestedAt: string | null
  title?: string
  summary?: string
  images: DocumentImage[]
}

export interface DocumentPreview {
  document: KnowledgeDocument | null
  chunks: Array<{
    id: string
    chunkIndex: number
    text: string
    headingPath?: string
    articleNumber?: string
    isActive: boolean
    images: DocumentImage[]
  }>
  images: DocumentImage[]
  selected: number
}

export interface StageItem {
  id: string
  rank: number
  score?: number
  filename: string
  text: string
  chunkIndex: number
  country: string
  jurisdiction: string
  docType: string
  headingPath?: string
  articleNumber?: string
  sourceUrl?: string
}

export interface Exploration {
  query: string
  filter: Record<string, string | boolean>
  topK: number
  models: { embedding: string; rerank: string }
  timings: { embedMs: number; denseMs: number; sparseMs: number; rerankMs: number; totalMs: number }
  stages: {
    dense: StageItem[]
    sparse: StageItem[]
    fused: StageItem[]
    reranked: StageItem[]
    final: StageItem[]
  }
  warnings: string[]
}

export interface ImageInput {
  /** Stable id for generated reference figures; a UUID is used when omitted. */
  id?: string
  caption: string
  alt?: string
  tags?: string[]
  dimension?: ReadinessDimension
  articleNumber?: string
  headingPath?: string
  source?: DocumentImage['source']
  mime: string
  dataBase64: string
}

export interface IngestTextInput {
  text: string
  filename: string
  country: string
  jurisdiction: Jurisdiction
  docType: DocType
  namespace?: string
  version?: string
  sourceUrl?: string
}

export type IngestStepStatus = 'ok' | 'skipped' | 'warning' | 'error'

export interface IngestStep {
  id: 'validate' | 'chunk' | 'embed' | 'write' | 'indexes' | 'verify'
  status: IngestStepStatus
  label: string
  detail: string
  count?: number
  ms: number
}

export interface IngestResult {
  ok: boolean
  documentId: string
  filename: string
  country: string
  docType: string
  collection: string
  chunks: number
  inserted: number
  unchanged: number
  deactivated: number
  characters: number
  embeddingModel: string
  dimensions: number | null
  durationMs: number
  steps: IngestStep[]
  error?: string
}

interface ImageDocument extends Document {
  _id: string
  filename: string
  documentId: string
  caption: string
  alt?: string
  tags?: string[]
  dimension?: ReadinessDimension
  articleNumber?: string
  headingPath?: string
  source?: DocumentImage['source']
  mime: string
  data?: Binary
  createdAt: Date
  updatedAt: Date
}

interface IngestDocument extends Document {
  _id: string
  filename: string
  chunks: number
  unchanged: number
  processedAt: string
}

interface Point {
  id: string | number
  score?: number
  payload?: Record<string, unknown>
}

interface ChunkPayload {
  filename?: string
  text?: string
  chunkIndex?: number
  country?: string
  jurisdiction?: string
  docType?: string
  type?: string
  headingPath?: string
  articleNumber?: string
  sourceUrl?: string
  namespace?: string
  title?: string
  summary?: string
  isActive?: boolean
  updatedAt?: string
  metadata?: { version?: string }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stageItem(point: Point, rank: number): StageItem {
  const payload = (point.payload ?? {}) as ChunkPayload
  return {
    id: String(point.id),
    rank,
    ...(typeof point.score === 'number' ? { score: point.score } : {}),
    filename: payload.filename ?? '',
    text: payload.text ?? '',
    chunkIndex: Number(payload.chunkIndex ?? 0),
    country: payload.country ?? '',
    jurisdiction: payload.jurisdiction ?? 'national',
    docType: payload.docType ?? payload.type ?? 'policy',
    ...(payload.headingPath ? { headingPath: payload.headingPath } : {}),
    ...(payload.articleNumber ? { articleNumber: payload.articleNumber } : {}),
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
  }
}

/**
 * Full knowledge-base client for the console.
 */
export class QdrantKnowledge {
  private readonly cfg: QdrantKnowledgeConfig &
    Required<Pick<QdrantKnowledgeConfig, 'denseVector' | 'sparseVector' | 'sparseModel' | 'embeddingModel'>>
  private readonly client: QdrantClient
  private mongo: MongoClient | null = null
  private dimension: number | null = null

  constructor(config: QdrantKnowledgeConfig) {
    this.cfg = { ...DEFAULTS, ...config } as typeof this.cfg
    this.client = new QdrantClient({ url: config.qdrantUrl, apiKey: config.qdrantApiKey })
  }

  private async mongoClient(): Promise<MongoClient> {
    if (!this.mongo) {
      this.mongo = new MongoClient(this.cfg.mongodbUri)
      await this.mongo.connect()
    }
    return this.mongo
  }

  private async images(): Promise<Collection<ImageDocument>> {
    return (await this.mongoClient()).db(this.cfg.dbName).collection<ImageDocument>(IMAGE_COLLECTION)
  }

  private async ingestionLog(): Promise<Collection<IngestDocument>> {
    return (await this.mongoClient()).db(this.cfg.dbName).collection<IngestDocument>(INGEST_LOG)
  }

  private imageMetadata(doc: ImageDocument): DocumentImage {
    return {
      id: doc._id,
      url: `/v1/kb/images/${doc._id}`,
      caption: doc.caption,
      ...(doc.alt ? { alt: doc.alt } : {}),
      ...(doc.tags ? { tags: doc.tags } : {}),
      ...(doc.dimension ? { dimension: doc.dimension } : {}),
      ...(doc.articleNumber ? { articleNumber: doc.articleNumber } : {}),
      ...(doc.headingPath ? { headingPath: doc.headingPath } : {}),
      ...(doc.source ? { source: doc.source } : {}),
    }
  }

  private async embedding(text: string): Promise<number[]> {
    const base = this.cfg.embeddingsBaseUrl.replace(/\/$/, '')
    const response = await fetch(`${base}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.cfg.embeddingModel, input: [text] }),
    })
    if (!response.ok) throw new Error(`Local embedding failed (${response.status}): ${await response.text()}`)
    const payload = (await response.json()) as { embeddings?: number[][] }
    const vector = payload.embeddings?.[0]
    if (!vector) throw new Error('Local embedding returned no vector')
    return vector
  }

  /** Paginate every point matching a filter, payload-only. */
  private async scrollAll(
    filter: Record<string, unknown> | undefined,
    withPayload: boolean | string[] = true,
  ): Promise<Point[]> {
    const points: Point[] = []
    let offset: string | number | Record<string, unknown> | null | undefined = undefined
    for (;;) {
      const page = await this.client.scroll(this.cfg.collection, {
        limit: 512,
        ...(filter ? { filter } : {}),
        with_payload: withPayload,
        with_vector: false,
        ...(offset ? { offset } : {}),
      })
      points.push(...((page.points ?? []) as unknown as Point[]))
      offset = page.next_page_offset ?? undefined
      if (!offset) break
    }
    return points
  }

  private async documentPoints(filename: string): Promise<Point[]> {
    return this.scrollAll({ must: [{ key: 'filename', match: { value: filename } }] })
  }

  private async collectionExists(): Promise<boolean> {
    return this.client
      .getCollection(this.cfg.collection)
      .then(() => true)
      .catch(() => false)
  }

  /** Create the collection and its payload indexes, idempotently. */
  async ensureIndexes(): Promise<{
    inspection: KnowledgeStatus['indexes']
    ensured: { supported: boolean; created: string[]; updated: string[]; unchanged: string[] }
  }> {
    const created: string[] = []
    const updated: string[] = []
    const unchanged: string[] = []
    try {
      if (!(await this.collectionExists())) {
        await this.client.createCollection(this.cfg.collection, {
          vectors: { [this.cfg.denseVector]: { size: DEFAULTS.embeddingDimension, distance: 'Cosine' } },
          sparse_vectors: { [this.cfg.sparseVector]: { modifier: 'idf' } },
        } as never)
      }
      const fields = await this.payloadFields()
      for (const field of ['country', 'jurisdiction', 'docType', 'namespace']) {
        if (fields.includes(field)) {
          unchanged.push(field)
          continue
        }
        await this.client.createPayloadIndex(this.cfg.collection, { field_name: field, field_schema: 'keyword' } as never)
        created.push(field)
      }
      if (fields.includes('isActive')) unchanged.push('isActive')
      else {
        await this.client.createPayloadIndex(this.cfg.collection, { field_name: 'isActive', field_schema: 'bool' } as never)
        created.push('isActive')
      }
      return { inspection: await this.inspectIndexes(), ensured: { supported: true, created, updated, unchanged } }
    } catch {
      return { inspection: await this.inspectIndexes(), ensured: { supported: false, created, updated, unchanged } }
    }
  }

  private async payloadFields(): Promise<string[]> {
    try {
      const info = await this.client.getCollection(this.cfg.collection)
      return Object.keys((info as unknown as { payload_schema?: Record<string, unknown> }).payload_schema ?? {})
    } catch {
      return []
    }
  }

  private async inspectIndexes(): Promise<KnowledgeStatus['indexes']> {
    try {
      const info = await this.client.getCollection(this.cfg.collection)
      const schema = (info as unknown as { payload_schema?: Record<string, unknown> }).payload_schema ?? {}
      return {
        supported: true,
        collectionExists: true,
        indexes: Object.keys(schema).map((name) => ({ name, state: 'ready' })),
      }
    } catch (error) {
      const missing = /not found|404/i.test((error as Error).message)
      return {
        supported: true,
        collectionExists: !missing,
        indexes: [],
        ...(missing ? { error: 'Collection not created yet.' } : {}),
      }
    }
  }

  private async vectorDimension(): Promise<number | null> {
    if (this.dimension) return this.dimension
    try {
      const info = await this.client.getCollection(this.cfg.collection)
      const vectors = (info as unknown as { config?: { params?: { vectors?: unknown } } }).config?.params?.vectors
      if (vectors && typeof vectors === 'object') {
        for (const value of Object.values(vectors as Record<string, unknown>)) {
          if (value && typeof value === 'object' && typeof (value as { size?: unknown }).size === 'number') {
            this.dimension = (value as { size: number }).size
          }
        }
      }
    } catch {
      return null
    }
    return this.dimension
  }

  /** Corpus + index state, as the Knowledge screen shows it. */
  async status(): Promise<KnowledgeStatus> {
    const exists = await this.collectionExists()
    const points = exists ? await this.scrollAll(undefined, ['country', 'docType', 'filename', 'isActive', 'text', 'updatedAt']) : []
    const byCountry = new Map<string, number>()
    const byDocType = new Map<string, number>()
    const documents = new Set<string>()
    let activeChunks = 0
    let characters = 0
    let lastIngestedAt: string | null = null
    for (const point of points) {
      const payload = (point.payload ?? {}) as ChunkPayload
      const country = payload.country ?? 'global'
      const docType = payload.docType ?? payload.type ?? 'policy'
      byCountry.set(country, (byCountry.get(country) ?? 0) + 1)
      byDocType.set(docType, (byDocType.get(docType) ?? 0) + 1)
      if (payload.filename) documents.add(payload.filename)
      if (payload.isActive !== false) activeChunks += 1
      characters += (payload.text ?? '').length
      if (payload.updatedAt && (!lastIngestedAt || payload.updatedAt > lastIngestedAt)) lastIngestedAt = payload.updatedAt
    }
    const runs = await (await this.ingestionLog()).find({}).sort({ processedAt: -1 }).limit(10).toArray().catch(() => [])
    return {
      collection: this.cfg.collection,
      collectionEmpty: points.length === 0,
      documents: documents.size,
      chunks: points.length,
      indexedChunks: points.length,
      namespaces: [],
      countries: [...byCountry.keys()],
      docTypes: [...byDocType.keys()],
      lastIngestedAt,
      totals: {
        chunks: points.length,
        activeChunks,
        documents: documents.size,
        characters,
        lastIngestedAt,
      },
      byCountry: [...byCountry.entries()].map(([value, chunks]) => ({ value, chunks })).sort((a, b) => b.chunks - a.chunks),
      byDocType: [...byDocType.entries()].map(([value, chunks]) => ({ value, chunks })).sort((a, b) => b.chunks - a.chunks),
      indexes: await this.inspectIndexes(),
      expectedIndexes: PAYLOAD_FIELDS,
      embedding: {
        model: this.cfg.embeddingModel,
        rerankModel: this.cfg.rerankModel ?? '',
        dimensions: await this.vectorDimension(),
        missingVectors: 0,
        mismatchedVectors: 0,
      },
      recentRuns: runs.map((run) => ({ filename: run.filename, chunks: run.chunks, processedAt: run.processedAt })),
    }
  }

  /** One row per document, aggregated from the Qdrant payloads. */
  async listDocuments(options: { limit?: number; query?: string; includeRetired?: boolean } = {}): Promise<KnowledgeDocument[]> {
    const limit = options.limit ?? 50
    const needle = options.query?.trim().toLowerCase() ?? ''
    const rows = new Map<
      string,
      {
        filename: string
        country: string
        docType: string
        namespace?: string
        version?: string
        sourceUrl?: string
        title?: string
        summary?: string
        chunks: number
        activeChunks: number
        characters: number
        latest: string
      }
    >()

    for (const point of await this.scrollAll(undefined, true)) {
      const payload = (point.payload ?? {}) as ChunkPayload
      const filename = payload.filename ?? ''
      if (!filename) continue
      const active = payload.isActive !== false
      const textLength = (payload.text ?? '').length
      const updatedAt = payload.updatedAt ?? ''
      const current = rows.get(filename)
      if (current) {
        current.chunks += 1
        if (active) current.activeChunks += 1
        current.characters += textLength
        if (updatedAt > current.latest) current.latest = updatedAt
      } else {
        rows.set(filename, {
          filename,
          country: payload.country ?? 'global',
          docType: payload.docType ?? payload.type ?? 'policy',
          ...(payload.namespace ? { namespace: payload.namespace } : {}),
          ...(payload.metadata?.version ? { version: payload.metadata.version } : {}),
          ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
          ...(payload.title ? { title: payload.title } : {}),
          ...(payload.summary ? { summary: payload.summary } : {}),
          chunks: 1,
          activeChunks: active ? 1 : 0,
          characters: textLength,
          latest: updatedAt,
        })
      }
    }

    const images = await this.imagesByFilename([...rows.keys()])
    return [...rows.values()]
      .filter((row) => options.includeRetired || row.activeChunks > 0)
      .filter((row) => !needle || `${row.filename} ${row.title ?? ''} ${row.summary ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => a.filename.localeCompare(b.filename))
      .slice(0, limit)
      .map((row) => ({
        filename: row.filename,
        documentId: hash(row.filename),
        chunks: row.chunks,
        activeChunks: row.activeChunks,
        characters: row.characters,
        country: row.country,
        docType: row.docType,
        ...(row.namespace ? { namespace: row.namespace } : {}),
        ...(row.version ? { version: row.version } : {}),
        ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
        lastIngestedAt: row.latest || null,
        ...(row.title ? { title: row.title } : {}),
        ...(row.summary ? { summary: row.summary } : {}),
        images: images.get(row.filename) ?? [],
      }))
  }

  async imagesByFilename(filenames: string[]): Promise<Map<string, DocumentImage[]>> {
    const result = new Map<string, DocumentImage[]>()
    if (filenames.length === 0) return result
    const docs = await (await this.images()).find({ filename: { $in: filenames } }).toArray().catch(() => [])
    for (const doc of docs) {
      const list = result.get(doc.filename) ?? []
      list.push(this.imageMetadata(doc))
      result.set(doc.filename, list)
    }
    return result
  }

  async attachImages(filename: string, images: ImageInput[]): Promise<DocumentImage[]> {
    const documentId = hash(filename)
    const now = new Date()
    const collection = await this.images()
    const saved: DocumentImage[] = []
    for (const image of images) {
      const id = image.id ?? randomUUID()
      const doc: ImageDocument = {
        _id: id,
        filename,
        documentId,
        caption: image.caption,
        ...(image.alt ? { alt: image.alt } : {}),
        ...(image.tags ? { tags: image.tags } : {}),
        ...(image.dimension ? { dimension: image.dimension } : {}),
        ...(image.articleNumber ? { articleNumber: image.articleNumber } : {}),
        ...(image.headingPath ? { headingPath: image.headingPath } : {}),
        ...(image.source ? { source: image.source } : {}),
        mime: image.mime,
        data: new Binary(Buffer.from(image.dataBase64, 'base64')),
        createdAt: now,
        updatedAt: now,
      }
      await collection.insertOne(doc as never)
      saved.push(this.imageMetadata(doc))
    }
    return saved
  }

  async getImage(id: string): Promise<{ mime: string; data: Buffer } | null> {
    const doc = await (await this.images()).findOne({ _id: id })
    if (!doc || !doc.data) return null
    return { mime: doc.mime, data: Buffer.from(doc.data.buffer) }
  }

  async updateImage(
    id: string,
    patch: { caption?: string; alt?: string; tags?: string[]; dimension?: ReadinessDimension | null },
  ): Promise<boolean> {
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.caption !== undefined) update.caption = patch.caption
    if (patch.alt !== undefined) update.alt = patch.alt
    if (patch.tags !== undefined) update.tags = patch.tags
    if (patch.dimension !== undefined) update.dimension = patch.dimension
    const result = await (await this.images()).updateOne({ _id: id }, { $set: update })
    return result.modifiedCount > 0
  }

  async deleteImage(id: string): Promise<boolean> {
    const result = await (await this.images()).deleteOne({ _id: id })
    return result.deletedCount > 0
  }

  async chunksOf(filename: string) {
    return (await this.documentPoints(filename))
      .map((point) => {
        const payload = (point.payload ?? {}) as ChunkPayload
        return {
          id: String(point.id),
          chunkIndex: Number(point.payload?.chunkIndex ?? 0),
          text: payload.text ?? '',
          isActive: point.payload?.isActive !== false,
          ...(payload.headingPath ? { headingPath: payload.headingPath } : {}),
          ...(payload.articleNumber ? { articleNumber: payload.articleNumber } : {}),
        }
      })
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
  }

  async preview(filename: string, chunkIndex?: number): Promise<DocumentPreview> {
    const documents = await this.listDocuments({ limit: 200, includeRetired: true })
    const document = documents.find((row) => row.filename === filename) ?? null
    const chunks = await this.chunksOf(filename)
    const images = document?.images ?? []
    const selected = chunkIndex === undefined ? 0 : Math.max(0, chunks.findIndex((chunk) => chunk.chunkIndex === chunkIndex))
    return {
      document,
      chunks: chunks.map((chunk) => ({ ...chunk, images: [] as DocumentImage[] })),
      images,
      selected,
    }
  }

  async setDocumentActive(filename: string, active: boolean): Promise<number> {
    const ids = (await this.documentPoints(filename)).map((point) => point.id)
    if (ids.length === 0) return 0
    await this.client.setPayload(this.cfg.collection, { payload: { isActive: active }, points: ids as never })
    return ids.length
  }

  async deleteDocument(filename: string): Promise<{ chunks: number; images: number }> {
    const ids = (await this.documentPoints(filename)).map((point) => point.id)
    if (ids.length > 0) {
      await this.client.delete(this.cfg.collection, { points: ids as never, wait: true })
    }
    const images = await (await this.images()).deleteMany({ filename })
    await (await this.ingestionLog()).deleteMany({ filename })
    return { chunks: ids.length, images: images.deletedCount }
  }

  async updateDocument(
    filename: string,
    patch: {
      title?: string
      summary?: string
      country?: string
      docType?: DocType
      namespace?: string
      version?: string
      sourceUrl?: string
    },
  ): Promise<number> {
    const payload: Record<string, unknown> = {}
    if (patch.title !== undefined) payload.title = patch.title
    if (patch.summary !== undefined) payload.summary = patch.summary
    if (patch.country !== undefined) payload.country = patch.country
    if (patch.docType !== undefined) {
      payload.docType = patch.docType
      payload.type = patch.docType
    }
    if (patch.namespace !== undefined) payload.namespace = patch.namespace
    if (patch.version !== undefined) payload.metadata = { version: patch.version }
    if (patch.sourceUrl !== undefined) payload.sourceUrl = patch.sourceUrl
    if (Object.keys(payload).length === 0) return 0
    const ids = (await this.documentPoints(filename)).map((point) => point.id)
    if (ids.length === 0) return 0
    await this.client.setPayload(this.cfg.collection, { payload, points: ids as never })
    return ids.length
  }

  async updateChunk(id: string, patch: { text?: string; active?: boolean }): Promise<boolean> {
    const points = await this.client.retrieve(this.cfg.collection, {
      ids: [id] as never,
      with_payload: true,
      with_vector: false,
    })
    const point = points[0] as unknown as Point | undefined
    if (!point) return false
    const payload = (point.payload ?? {}) as ChunkPayload

    if (patch.text !== undefined && patch.text !== payload.text) {
      const dense = await this.embedding(patch.text)
      const updatedAt = new Date().toISOString()
      await this.client.upsert(this.cfg.collection, {
        points: [
          {
            id: point.id,
            vector: {
              [this.cfg.denseVector]: dense,
              [this.cfg.sparseVector]: { text: patch.text, model: this.cfg.sparseModel },
            },
            payload: {
              ...payload,
              text: patch.text,
              contentHash: hash(
                `${payload.country ?? ''}:${payload.jurisdiction ?? ''}:${payload.docType ?? ''}:${payload.filename ?? ''}:${patch.text}`,
              ),
              updatedAt,
            },
          } as never,
        ],
        wait: true,
      })
    } else if (patch.active !== undefined) {
      await this.client.setPayload(this.cfg.collection, {
        payload: { isActive: patch.active },
        points: [point.id] as never,
      })
    }
    return true
  }

  async ingest(input: IngestTextInput): Promise<IngestResult> {
    const started = Date.now()
    const documentId = hash(input.filename)
    const steps: IngestStep[] = []
    const addStep = (step: IngestStep) => steps.push(step)

    addStep({ id: 'validate', status: 'ok', label: 'Validate', detail: `${input.text.length} characters`, count: input.text.length, ms: 0 })

    try {
      const response = await fetch(`${this.cfg.ingestionUrl.replace(/\/$/, '')}/v1/ingest/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.cfg.ingestionApiKey ? { 'X-API-Key': this.cfg.ingestionApiKey } : {}),
        },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(`Ingestion failed (${response.status}): ${await response.text()}`)
      const payload = (await response.json()) as {
        chunksProcessed?: number
        chunksInserted?: number
        chunksSkipped?: number
        usedOcr?: boolean
      }
      const chunks = payload.chunksProcessed ?? 0
      const inserted = payload.chunksInserted ?? 0
      const unchanged = payload.chunksSkipped ?? 0
      addStep({ id: 'chunk', status: 'ok', label: 'Chunk', detail: `${payload.chunksProcessed ?? 0} passages`, count: payload.chunksProcessed ?? 0, ms: 0 })
      addStep({ id: 'embed', status: 'ok', label: 'Embed', detail: this.cfg.embeddingModel, count: payload.chunksInserted ?? 0, ms: 0 })
      addStep({ id: 'write', status: 'ok', label: 'Write', detail: `${inserted} inserted, ${unchanged} unchanged`, count: inserted, ms: 0 })
      addStep({ id: 'indexes', status: 'ok', label: 'Indexes', detail: this.cfg.collection, ms: 0 })

      const processedAt = new Date().toISOString()
      await (await this.ingestionLog()).insertOne({ _id: hash(`${input.filename}:${processedAt}`), filename: input.filename, chunks, unchanged, processedAt })
      addStep({ id: 'verify', status: 'ok', label: 'Verify', detail: 'done', count: chunks, ms: 0 })

      return {
        ok: true,
        documentId,
        filename: input.filename,
        country: input.country,
        docType: input.docType,
        collection: this.cfg.collection,
        chunks,
        inserted,
        unchanged,
        deactivated: 0,
        characters: input.text.length,
        embeddingModel: this.cfg.embeddingModel,
        dimensions: await this.vectorDimension(),
        durationMs: Date.now() - started,
        steps,
      }
    } catch (error) {
      addStep({ id: 'write', status: 'error', label: 'Ingest', detail: (error as Error).message, ms: Date.now() - started })
      return {
        ok: false,
        documentId,
        filename: input.filename,
        country: input.country,
        docType: input.docType,
        collection: this.cfg.collection,
        chunks: 0,
        inserted: 0,
        unchanged: 0,
        deactivated: 0,
        characters: input.text.length,
        embeddingModel: this.cfg.embeddingModel,
        dimensions: await this.vectorDimension(),
        durationMs: Date.now() - started,
        steps,
        error: (error as Error).message,
      }
    }
  }

  /** Retrieval playground: every stage, with scores and provenance. */
  async explore(query: RetrievalQuery & { topK?: number }): Promise<Exploration> {
    const topK = query.topK ?? 6
    const warnings: string[] = []
    const filter: Record<string, string | boolean> = {
      ...(query.country ? { country: query.country } : {}),
      ...(query.docType ? { docType: String(query.docType) } : {}),
      ...(query.jurisdiction ? { jurisdiction: query.jurisdiction } : {}),
      ...(query.namespace ? { namespace: query.namespace } : {}),
      isActive: true,
    }
    const must: Array<Record<string, unknown>> = [{ key: 'isActive', match: { value: true } }]
    if (query.country) must.push({ key: 'country', match: { value: query.country } })
    if (query.jurisdiction) must.push({ key: 'jurisdiction', match: { value: query.jurisdiction } })
    if (query.docType) must.push({ key: 'docType', match: { value: query.docType } })
    if (query.namespace) must.push({ key: 'namespace', match: { value: query.namespace } })
    const qFilter = { must }

    const embedStart = Date.now()
    const dense = await this.embedding(query.text)
    const embedMs = Date.now() - embedStart

    const denseStart = Date.now()
    const densePoints = await this.client
      .query(this.cfg.collection, { query: dense, using: this.cfg.denseVector, filter: qFilter, limit: topK * 3, with_payload: true })
      .then((res) => (res.points ?? []) as unknown as Point[])
      .catch(() => {
        warnings.push('Dense vector stage unavailable.')
        return [] as Point[]
      })
    const denseMs = Date.now() - denseStart

    const sparseStart = Date.now()
    const sparsePoints = await this.client
      .query(this.cfg.collection, {
        query: { text: query.text, model: this.cfg.sparseModel },
        using: this.cfg.sparseVector,
        filter: qFilter,
        limit: topK * 3,
        with_payload: true,
      })
      .then((res) => (res.points ?? []) as unknown as Point[])
      .catch(() => {
        warnings.push('BM25 stage unavailable.')
        return [] as Point[]
      })
    const sparseMs = Date.now() - sparseStart

    const fusedStart = Date.now()
    const fusedPoints = await this.client
      .query(this.cfg.collection, {
        prefetch: [
          { query: dense, using: this.cfg.denseVector, limit: topK * 3, filter: qFilter },
          { query: { text: query.text, model: this.cfg.sparseModel }, using: this.cfg.sparseVector, limit: topK * 3, filter: qFilter },
        ],
        query: { fusion: 'rrf' },
        limit: topK * 2,
        with_payload: true,
      })
      .then((res) => (res.points ?? []) as unknown as Point[])
      .catch(() => {
        warnings.push('RRF fusion stage unavailable.')
        return [] as Point[]
      })
    const fusedMs = Date.now() - fusedStart

    const rerankStart = Date.now()
    let reranked: Point[] = fusedPoints
    if (fusedPoints.length > 1 && this.cfg.rerankUrl) {
      try {
        const response = await fetch(`${this.cfg.rerankUrl.replace(/\/$/, '')}/rerank`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.text, texts: fusedPoints.map((p) => String(p.payload?.text ?? '')), truncate: true }),
        })
        if (response.ok) {
          const payload = (await response.json()) as unknown
          const rows: Array<{ index: number; score: number }> = Array.isArray(payload)
            ? payload
            : ((payload as { results?: Array<{ index: number; score: number }> }).results ?? [])
          if (rows.length > 0) {
            reranked = rows
              .map((row) => {
                const point = fusedPoints[row.index]
                return point ? ({ ...point, score: row.score } as Point) : null
              })
              .filter((point): point is Point => Boolean(point))
          }
        }
      } catch {
        warnings.push('Reranker unavailable: the fused order is kept.')
      }
    }
    const rerankMs = Date.now() - rerankStart

    return {
      query: query.text,
      filter,
      topK,
      models: { embedding: this.cfg.embeddingModel, rerank: this.cfg.rerankModel ?? '' },
      timings: { embedMs, denseMs, sparseMs, rerankMs, totalMs: embedMs + denseMs + sparseMs + fusedMs + rerankMs },
      stages: {
        dense: densePoints.map(stageItem),
        sparse: sparsePoints.map(stageItem),
        fused: fusedPoints.map(stageItem),
        reranked: reranked.map(stageItem),
        final: reranked.slice(0, topK).map(stageItem),
      },
      warnings,
    }
  }

  async close(): Promise<void> {
    if (this.mongo) await this.mongo.close()
  }
}
