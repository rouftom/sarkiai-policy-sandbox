/** HTTP surface: knowledge base, agents, scenarios, readiness, audit. */

import { correctTranscript, describeProvider, generateStructured, plainTextReply, referenceImage, type DataPort } from '@sps/agents'
import { ActionError, ActionStore, type ActionRecord } from '../actions.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { analyzeGazettePage, OcrClient, toKbChunks, type GazettePage } from '@sps/gazette'
import { evaluateExercise, figureBriefs, writeAfterAction, type ExerciseDefinition } from '@sps/exercise'
import { analyzeImpact } from '@sps/impact'
import { IngestionClient } from '@sps/kb'
import type { QdrantKnowledge } from '@sps/retrieval'
import { ReadinessInterrupted, buildScenario, whatIf, type LeadDecision, type LeadState, type ReadinessReport } from '@sps/readiness'
import { approvalUrl, createApprovalToken, verifyApprovalToken } from '../approval-token.js'
import { LocalAsrClient, toVoiceFacts, type VoiceMode } from '@sps/voice'
import { buildRunDossier, renderDossierMarkdown } from '@sps/report'
import { sha256Hex } from '@sps/storage'
import { hasLanguage, institutionsForDomain, institutionsForDomains } from '@sps/shared'
import {
  READINESS_DIMENSIONS,
  type DocType,
  type Domain,
  type InstitutionSpec,
  type JointSituationReport,
  type ReadinessDimension,
  type ScenarioEvent,
  type WorkflowLens,
} from '@sps/shared'
import { createEngine, createKnowledgeIngestor, createScenario, recordProviderSwitch } from '../engine.js'
import { ApprovalStore, type ApprovalDecision } from '../approvals.js'
import { scenarioFor, type ScenarioLang } from '../scenarios.js'
import { ScenarioRunStore, type ScenarioRunRecord } from '../scenario-runs.js'
import { ExerciseReportStore } from '../exercise-reports.js'
import { buildScenarioExport } from '../scenario-report.js'
import { healthBreachExercise } from '../exercises.js'
import { config } from '../config.js'
import { currentOperator, registerAuthRoutes } from '../auth-routes.js'
import { McpGateway } from '../mcp.js'
import { ChatSessionStore } from '../chat-sessions.js'
import { ReadinessRunStore, type ReadinessRun, type ReadinessRunInput, type ReadinessRunSummary } from '../readiness-runs.js'
import { NotificationContactStore, type NotificationContact } from '../notification-contacts.js'
import { COUNTRY_SECTORS, CountryStore, type CountryRecord } from '../countries.js'
import { listMailOutbox, mailConfigured, mailFrom, sendNotificationEmail } from '../mailer.js'
import { buildReadinessReport } from '../readiness-report.js'
import { defaultChatModel } from '@sps/agents'
import { auth } from '../auth.js'

const engine = createEngine()
const ingestion = new IngestionClient({ baseUrl: config.ingestion.baseUrl, apiKey: config.ingestion.apiKey })
const knowledge: QdrantKnowledge = createKnowledgeIngestor()

/**
 * What the assistant can read and, once the operator approves, delete. Every
 * call is scoped to one operator: an agent never sees another operator's data.
 */
function buildDataPort(userId: string): DataPort {
  const matches = (row: unknown, query?: string, country?: string) => {
    const record = row as { country?: unknown }
    if (country && String(record.country ?? '').toLowerCase() !== country.toLowerCase()) return false
    return !query || JSON.stringify(row).toLowerCase().includes(query.toLowerCase())
  }
  return {
    async list(entity, { limit, country, query }) {
      const take = (rows: unknown[]) => rows.filter((row) => matches(row, query, country)).slice(0, limit)
      switch (entity) {
        case 'readiness_runs':
          return take(await readinessRuns.list(userId, 50))
        case 'scenario_runs':
          return take(await scenarioRuns.list(userId, 50))
        case 'exercise_reports':
          return take(await exerciseReports.listAll(userId, 50))
        case 'chat_sessions':
          return take(await chatSessions.list(userId, 50))
        case 'audit_events':
          return (await engine.audit.listAudit(Math.min(limit * 4, 200), userId)).slice(0, limit)
        case 'knowledge_documents':
          return take(await knowledge.listDocuments({ limit: 50, ...(query ? { query } : {}) }))
        case 'countries':
          return take((await countries.list()).map((country) => ({ ...country, notes: country.notes ?? null })))
      }
    },
    async get(entity, id) {
      switch (entity) {
        case 'readiness_runs':
          return readinessRuns.get(id, userId)
        case 'scenario_runs': {
          const run = await scenarioRuns.get(id, userId)
          return run ? { ...run, reports: run.reports.slice(-1) } : null
        }
        case 'exercise_reports': {
          const saved = await exerciseReports.get(id, userId)
          if (!saved) return null
          const { images: _images, ...report } = saved.report as { images?: unknown }
          return { ...saved, report }
        }
        case 'chat_sessions': {
          const session = await chatSessions.get(id, userId)
          return session ? { ...session, turns: session.turns.slice(-20) } : null
        }
        case 'countries':
          return countries.get(id).then((country) => (country ? { ...country, notes: country.notes ?? null } : null))
        case 'audit_events':
        case 'knowledge_documents':
          return null
      }
    },
    async remove(entity, id) {
      switch (entity) {
        case 'readiness_runs':
          return readinessRuns.delete(id, userId)
        case 'scenario_runs':
          return scenarioRuns.delete(id, userId)
        case 'chat_sessions':
          return chatSessions.remove(id, userId)
      }
    },
  }
}

/**
 * What an approved action does. Side effects are the only thing the agent can
 * cause outside the console, so each one has a single explicit handler here.
 * The approval notification is delivered through the local e-mail/console
 * channel; when no recipient is configured the request is recorded, not faked.
 */
async function executeAction(action: ActionRecord): Promise<string> {
  const notify = async (summary: string): Promise<string> => {
    const to = action.payload?.email ? String(action.payload.email) : action.userId
    if (!to) throw new Error('This approval has no recipient: approve from an operator session.')
    if (!config.approvals.secret) throw new Error('SESSION_SECRET is not configured; cannot sign an approval link.')
    const { token, claims } = createApprovalToken({
      runId: action.runId,
      userId: action.userId,
      secret: config.approvals.secret,
      ttlSeconds: 1_440 * 60,
      subject: summary,
    })
    await sendNotificationEmail({
      to,
      subject: `${action.title} · ${config.mail.from}`,
      heading: action.title,
      intro: summary,
      message: 'Open the console to record your decision.',
      cta: { label: 'Open the approval', url: approvalUrl(config.web.canonicalUrl, token) },
      note: `This link expires on ${new Date(claims.exp * 1000).toISOString()}.`,
      locale: 'en',
    })
    return `Approval request delivered to ${to}.`
  }

  if (action.kind === 'notify_approval') return notify(action.summary)
  if (action.kind === 'publish_communication') {
    await engine.audit.logAction({ actor: 'operator', action: 'communication.approved', target: action.title, lens: 'hybrid', runId: action.runId, ...(action.userId ? { userId: action.userId } : {}) })
    return 'Approved and recorded in the audit trail. Nothing was published automatically.'
  }
  if (action.kind === 'record_gap') {
    const severity = String(action.payload?.severity ?? 'medium')
    const description = String(action.payload?.description ?? action.summary)
    await engine.audit.logAction({
      actor: 'operator',
      action: 'gap.recorded',
      target: `${severity}: ${description}`,
      lens: 'hybrid',
      runId: action.runId,
      ...(action.userId ? { userId: action.userId } : {}),
    })
    return 'Gap recorded in the audit trail.'
  }
  if (action.kind === 'delete_record') {
    const entity = String(action.payload?.entity ?? '')
    const id = String(action.payload?.id ?? '')
    if (entity !== 'readiness_runs' && entity !== 'scenario_runs' && entity !== 'chat_sessions') throw new Error(`Cannot delete "${entity}".`)
    if (!action.userId) throw new Error('This deletion has no operator.')
    const removed = await buildDataPort(action.userId).remove(entity, id)
    if (!removed) throw new Error(`No ${entity} "${id}" for this operator.`)
    await engine.audit.logAction({ actor: 'operator', action: 'record.deleted', target: `${entity}:${id}`, lens: 'hybrid', runId: action.runId, userId: action.userId })
    return `Deleted ${entity} ${id}.`
  }
  return 'Recorded.'
}

const mcpGateway = new McpGateway(process.env.SEA_MCP_API_KEY)

const chatSessions = new ChatSessionStore({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
const readinessRuns = new ReadinessRunStore({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
const scenarioRuns = new ScenarioRunStore({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
const exerciseReports = new ExerciseReportStore({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
const notificationContacts = new NotificationContactStore({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
})

const countries = new CountryStore({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
})

const actionStore = new ActionStore({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
  execute: executeAction,
})

const approvals = new ApprovalStore({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
})

const lensSchema = z.enum(['simulation', 'readiness', 'hybrid'])

/** In-memory facilitator session for tick-by-tick scenario release. */
interface ScenarioSession {
  runId: string
  userId: string
  country: string
  domain: Domain
  /** The language the agents answer in: the operator's. */
  lang: ScenarioLang
  institutions: InstitutionSpec[]
  events: ScenarioEvent[]
  ticks: number[]
  released: number
  history: ScenarioEvent[]
  reports: JointSituationReport[]
}

const scenarioSessions = new Map<string, ScenarioSession>()

/** A page larger than this is a mistake or an attack, not a gazette scan. */
const GAZETTE_MAX_BYTES = 12 * 1024 * 1024

/**
 * On boot the engine keeps the model the operator saved last (if it is still
 * pulled), otherwise the first model Ollama lists. Nothing is read from a
 * hosted catalogue: the local server is the catalogue.
 */
export async function selectBootModel(app: FastifyInstance): Promise<void> {
  const saved = await auth.activeModel().catch(() => null)
  try {
    const models = await engine.listModels()
    const pick = models.find((m) => m.id === saved) ?? defaultChatModel(models)
    if (!pick) {
      app.log.warn('No model is pulled in Ollama; the console keeps the configured default.')
      return
    }
    engine.useModel(pick.id)
    app.log.info({ model: pick.id, available: models.length }, 'chat model selected from the local catalogue')
  } catch (error) {
    app.log.warn({ error: (error as Error).message }, 'Ollama model list unavailable at boot')
    if (saved) engine.useModel(saved)
  }
}

/**
 * Routes that must stay reachable without a console session: health, the
 * sign-in/sign-up/reset handshake, the signed approval links and the public
 * knowledge figures. Everything else requires `Authorization: Bearer <session>`.
 */
function isPublicRoute(method: string, path: string): boolean {
  if (method === 'OPTIONS') return true
  if (path === '/health') return true
  if (path.startsWith('/v1/approvals/')) return true
  if (path.startsWith('/v1/kb/images/') && method === 'GET') return true
  if (path === '/v1/auth/setup') return true
  if (path === '/v1/auth/signup') return true
  if (path === '/v1/auth/login') return true
  if (path === '/v1/auth/password') return true
  if (path === '/v1/auth/password/forgot') return true
  if (path === '/v1/auth/password/reset') return true
  if (path === '/v1/auth/email/verify') return true
  if (path === '/v1/auth/email/resend') return true
  if (path === '/v1/auth/mfa/enroll') return true
  if (path === '/v1/auth/mfa/confirm') return true
  if (path === '/v1/auth/mfa/verify') return true
  return false
}

/** The Bearer guard ran for this route, so the operator is present. */
function operatorOf(request: FastifyRequest) {
  if (!request.operator) throw new Error('Operator missing after the auth guard.')
  return request.operator
}

/**
 * Reference figure per readiness dimension (13), attached to an existing
 * document. Idempotent: a dimension whose figure already exists is skipped, so
 * the boot hatch can be left in place. The figure is a labelled SVG drawn
 * locally, never a model call.
 */
/** Two figures for the after-action report, drawn locally as labelled diagrams. */
function exerciseFigures(definition: ExerciseDefinition, lang: 'fr' | 'en') {
  const briefs = figureBriefs(definition, lang)
  const captions =
    lang === 'fr'
      ? { context: 'Contexte de l’exercice', timeline: 'Chronologie des incidents' }
      : { context: 'Exercise context', timeline: 'Incident timeline' }
  return briefs.map((brief) => ({
    id: brief.id,
    caption: captions[brief.id],
    ...referenceImage({ title: brief.fallbackTitle, lines: brief.fallbackLines }),
  }))
}

export async function seedReferenceImages(log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }) {
  const docs = await knowledge.listDocuments({ limit: 200 })
  if (docs.length === 0) return { generated: 0, skipped: 0, documents: 0, source: 'none' as const }

  let generated = 0
  let skipped = 0
  const sources = new Set<string>()
  for (const dimension of READINESS_DIMENSIONS) {
    const id = `ref_${dimension.shortName}`
    if (docs.some((doc) => doc.images.some((image) => image.id === id))) {
      skipped += 1
      continue
    }
    const target = docs[(dimension.id - 1) % docs.length]!
    const figure = referenceImage({
      title: dimension.name,
      lines: dimension.factors.map((factor) => `Factor: ${factor}`),
    })
    sources.add(figure.source)
    await knowledge.attachImages(target.filename, [
      {
        id,
        caption: `${dimension.name} · reference`,
        alt: `Reference diagram: ${dimension.name}`,
        tags: [dimension.shortName, ...dimension.factors],
        dimension: dimension.shortName,
        source: figure.source,
        mime: figure.mime,
        dataBase64: figure.dataBase64,
      },
    ])
    generated += 1
    log.info({ dimension: dimension.shortName, document: target.filename, source: figure.source }, 'reference figure attached')
  }
  return {
    generated,
    skipped,
    documents: docs.length,
    source: sources.size === 1 ? [...sources][0]! : sources.size > 1 ? 'mixed' : 'none',
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerAuthRoutes(app, engine.audit)

  // One guard for the whole API surface. Auth, health, the signed approval
  // links and corpus figures are public; everything that reads operator data
  // or spends local compute requires a valid session.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url
    if (isPublicRoute(request.method, path)) return
    const operator = currentOperator(request)
    if (!operator) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Sign in to use this endpoint.',
      })
    }
    request.operator = operator
  })

  // Announce the active provider in the audit chain (no-op when unchanged).
  void recordProviderSwitch(engine.provider, engine.audit)
  void selectBootModel(app)

  // ── Chat models: the models pulled into the local Ollama server ───────────
  app.get('/v1/models', async (request, reply) => {
    try {
      return {
        mode: engine.provider.mode,
        selected: engine.provider.models.reasoning,
        models: await engine.listModels(),
      }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  app.put('/v1/models/selection', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthenticated' })
    const body = z.object({ model: z.string().min(1).max(120) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    let models: Awaited<ReturnType<typeof engine.listModels>>
    try {
      models = await engine.listModels()
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
    if (!models.some((m) => m.id === body.data.model)) {
      return reply.status(400).send({ error: 'model_not_pulled', message: 'This model is not pulled in the local Ollama server.' })
    }

    engine.useModel(body.data.model)
    await auth.updatePreferences(operator.email, { model: body.data.model })
    await engine.audit
      .logAction({
        actor: operator.email,
        userId: operator.email,
        action: 'model.selected',
        target: body.data.model,
        lens: 'hybrid',
      })
      .catch(() => undefined)
    return { selected: body.data.model }
  })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'sps-api',
    provider: { mode: engine.provider.mode, model: engine.provider.models.reasoning },
  }))

  // ── Active provider (secret-free: what answers, and where) ────────────────
  app.get('/v1/provider', async () => engine.provider)

  // ── Knowledge base ────────────────────────────────────────────────────────
  // Live corpus + Qdrant index state. This is the source of truth behind the
  // Knowledge base screen: counts, embeddings, payload indexes.
  app.get('/v1/kb/status', async (request, reply) => {
    try {
      const status = await knowledge.status()
      return {
        backend: 'qdrant' as const,
        provider: { mode: engine.provider.mode, reasoning: engine.provider.models.reasoning },
        ...status,
      }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: `Knowledge base unavailable: ${(error as Error).message}` })
    }
  })

  app.get('/v1/kb/documents', async (request, reply) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        q: z.string().max(120).optional(),
        includeRetired: z.coerce.boolean().default(false),
      })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    try {
      return {
        documents: await knowledge.listDocuments({
          limit: query.data.limit,
          ...(query.data.q ? { query: query.data.q } : {}),
          includeRetired: query.data.includeRetired,
        }),
      }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  app.post('/v1/kb/documents/active', async (request, reply) => {
    const body = z
      .object({ filename: z.string().min(1), active: z.boolean() })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const modified = await knowledge.setDocumentActive(body.data.filename, body.data.active)
      return { filename: body.data.filename, active: body.data.active, modified }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Remove one document from the knowledge base: its passages, its figures and its metadata. */
  app.delete('/v1/kb/documents', async (request, reply) => {
    const query = z.object({ filename: z.string().min(1).max(300) }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    try {
      const deleted = await knowledge.deleteDocument(query.data.filename)
      return { filename: query.data.filename, ...deleted }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Preview of one document: its passages (chunk selected) and figures. */
  app.get('/v1/kb/documents/preview', async (request, reply) => {
    const query = z
      .object({ filename: z.string().min(1).max(300), chunkIndex: z.coerce.number().int().min(0).optional() })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    try {
      return await knowledge.preview(query.data.filename, query.data.chunkIndex)
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Every passage of one document, retired ones included, for the editor. */
  app.get('/v1/kb/documents/chunks', async (request, reply) => {
    const query = z.object({ filename: z.string().min(1).max(300) }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    return { chunks: await knowledge.chunksOf(query.data.filename) }
  })

  /** Document metadata: title, summary, and the fields propagated to its passages. */
  app.patch('/v1/kb/documents', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(300),
        title: z.string().max(200).optional(),
        summary: z.string().max(2000).optional(),
        country: z.string().min(2).max(10).optional(),
        docType: z.string().min(1).max(40).optional(),
        namespace: z.string().max(80).optional(),
        version: z.string().max(80).optional(),
        sourceUrl: z.string().url().max(500).optional().or(z.literal('')),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { filename, ...patch } = body.data
    const modified = await knowledge.updateDocument(filename, { ...patch, docType: patch.docType as DocType | undefined })
    return { filename, modified }
  })

  /** Edit one passage (re-embedded when its text changes) or retire / restore it. */
  app.patch('/v1/kb/chunks/:id', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ text: z.string().max(20_000).optional(), active: z.boolean().optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const updated = await knowledge.updateChunk(id, body.data)
      if (!updated) return reply.status(404).send({ error: 'Passage not found.' })
      return { id, updated }
    } catch (error) {
      request.log.error(error)
      return reply.status(422).send({ error: (error as Error).message })
    }
  })

  /** Attach figures to a document: uploaded bytes, stored once, shown in the document's Media tab and in citations. */
  app.post('/v1/kb/documents/images', { bodyLimit: 40 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(300),
        images: z
          .array(
            z.object({
              caption: z.string().min(1).max(300),
              alt: z.string().max(300).optional(),
              tags: z.array(z.string().max(40)).max(12).optional(),
              dimension: z.string().max(60).optional(),
              mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']),
              dataBase64: z.string().min(4).max(30_000_000),
            }),
          )
          .min(1)
          .max(12),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const images = await knowledge.attachImages(
      body.data.filename,
      body.data.images.map((image) => ({
        ...image,
        source: 'upload' as const,
        dimension: image.dimension as ReadinessDimension | undefined,
      })),
    )
    return { filename: body.data.filename, images }
  })

  /** Edit a figure's caption, alt text, tags or dimension. */
  app.patch('/v1/kb/images/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z
      .object({
        caption: z.string().min(1).max(300).optional(),
        alt: z.string().max(300).optional(),
        tags: z.array(z.string().max(40)).max(12).optional(),
        dimension: z.string().max(60).nullable().optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const updated = await knowledge.updateImage(id, {
      ...body.data,
      dimension: body.data.dimension as ReadinessDimension | null | undefined,
    })
    if (!updated) return reply.status(404).send({ error: 'Image not found or nothing to change.' })
    return { id, updated }
  })

  app.delete('/v1/kb/images/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const deleted = await knowledge.deleteImage(id)
    if (!deleted) return reply.status(404).send({ error: 'Image not found.' })
    return { id, deleted }
  })

  /** Generate the reference figures (labelled SVG drawn locally) and attach them to existing documents. */
  app.post('/v1/kb/images/reference', async (request, reply) => {
    try {
      return await seedReferenceImages(request.log)
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /**
   * Figure bytes. Public on purpose: an `<img>` cannot send the Bearer token,
   * and the figures are corpus material, not operator data.
   */
  app.get('/v1/kb/images/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const image = await knowledge.getImage(id)
    if (!image) return reply.status(404).send({ error: 'Image not found.' })
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.type(image.mime).send(image.data)
  })

  /** Create or repair the Qdrant collection and its payload indexes, on demand. */
  app.post('/v1/kb/indexes', async (request, reply) => {
    try {
      const result = await knowledge.ensureIndexes()
      return result
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Full-text ingestion: chunk → embed → upsert → ensure indexes. */
  app.post('/v1/kb/ingest/text', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        text: z.string().min(24).max(2_000_000),
        filename: z.string().min(1).max(200),
        country: z.string().min(2).max(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().min(1).default('policy'),
        namespace: z.string().max(80).optional(),
        version: z.string().max(80).optional(),
        sourceUrl: z.string().url().optional(),
        maxChars: z.number().int().min(300).max(6000).optional(),
        overlapChars: z.number().int().min(0).max(1000).optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const result = await knowledge.ingest({ ...body.data, docType: body.data.docType as DocType })
      if (!result.ok) return reply.status(422).send(result)
      return result
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /**
   * File upload from the console: PDF or plain text, sent as base64 JSON. The
   * API extracts the text (PDF via unpdf, no system binary) and runs the same
   * ingestion path as pasted text. Scans without a text layer are refused with
   * a pointer to the Gazette screen instead of being stored empty.
   */
  app.post('/v1/kb/ingest/file', { bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(200),
        contentBase64: z.string().min(4).max(34_000_000),
        country: z.string().min(2).max(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().min(1).default('policy'),
        namespace: z.string().max(80).optional(),
        version: z.string().max(80).optional(),
        sourceUrl: z.string().url().optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const bytes = Buffer.from(body.data.contentBase64, 'base64')
    let text: string
    try {
      if (/\.pdf$/i.test(body.data.filename)) {
        const { extractText, getDocumentProxy } = await import('unpdf')
        const pdf = await getDocumentProxy(new Uint8Array(bytes))
        text = String((await extractText(pdf, { mergePages: true })).text ?? '')
      } else {
        text = bytes.toString('utf8')
      }
    } catch (error) {
      return reply.status(422).send({ error: `Could not read the file: ${(error as Error).message}` })
    }

    if (text.trim().length < 200) {
      return reply.status(422).send({
        error: 'No text layer found. A scanned document goes through the Scanned gazette screen (OCR and zone segmentation).',
      })
    }

    try {
      const result = await knowledge.ingest({
        text,
        filename: body.data.filename.replace(/\.pdf$/i, '.txt'),
        country: body.data.country,
        jurisdiction: body.data.jurisdiction,
        docType: body.data.docType as DocType,
        ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
        ...(body.data.version ? { version: body.data.version } : {}),
        ...(body.data.sourceUrl ? { sourceUrl: body.data.sourceUrl } : {}),
      })
      if (!result.ok) return reply.status(422).send(result)
      return result
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Retrieval playground: every stage, with scores and provenance. */
  app.post('/v1/kb/search', async (request, reply) => {
    const body = z
      .object({
        text: z.string().min(2).max(2000),
        country: z.string().min(2).max(2).or(z.literal('global')).or(z.literal('')).default(''),
        jurisdiction: z.enum(['national', 'regional', 'international']).optional(),
        docType: z.string().optional(),
        namespace: z.string().optional(),
        topK: z.number().int().min(1).max(12).default(6),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const exploration = await knowledge.explore({
        text: body.data.text,
        country: body.data.country,
        ...(body.data.jurisdiction ? { jurisdiction: body.data.jurisdiction } : {}),
        ...(body.data.docType ? { docType: body.data.docType as DocType } : {}),
        ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
        topK: body.data.topK,
      })
      return exploration
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /**
   * Ingestion goes through the local Python service, which owns the structural
   * chunker and the Ollama embedding calls (Qdrant + bge-m3).
   */
  async function ingestText(input: Parameters<IngestionClient['ingestText']>[0]) {
    return ingestion.ingestText(input)
  }

  app.post('/v1/kb/ingest', async (request, reply) => {
    const body = z
      .object({
        text: z.string().min(1),
        filename: z.string().min(1),
        country: z.string().length(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().default('policy'),
        namespace: z.string().optional(),
        version: z.string().optional(),
        sourceUrl: z.string().url().optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const result = await ingestText({ ...body.data, docType: body.data.docType as DocType })
    return result
  })

  // ── Single mandated agent (text, optionally multimodal) ───────────────────
  const askBody = z.object({
    institutionId: z.string(),
    question: z.string().min(1),
    country: z.string().length(2),
    domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
    lens: lensSchema.default('hybrid'),
    /** The language of the answer: the console's. */
    language: z.enum(['fr', 'en']).default('en'),
    runId: z.string().optional(),
    /** Reasoning effort chosen in the console; absent lets the provider decide. */
    effort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
    // Untrusted user files (context only, never citable): images, or documents read as reference text.
    attachments: z
      .array(z.object({ mime: z.string(), dataBase64: z.string(), name: z.string().max(200).optional() }))
      .max(3)
      .optional(),
  })

  /** Persist attachments (content-addressed, best-effort: works without MinIO). */
  /** Documents the operator may attach as reference text (PDF is read, the others are plain text). */
  const DOCUMENT_MIMES = new Set(['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'])
  const REFERENCE_CHARS = 40_000

  async function storeAttachments(
    attachments: Array<{ mime: string; dataBase64: string; name?: string }> | undefined,
  ) {
    const meta: Array<{ sha256: string; mime: string; size: number; key: string }> = []
    const references: Array<{ name: string; text: string }> = []
    for (const attachment of attachments ?? []) {
      const isImage = attachment.mime.startsWith('image/')
      const isDocument = DOCUMENT_MIMES.has(attachment.mime)
      if (!isImage && !isDocument) {
        return { ok: false as const, status: 415, message: `Unsupported attachment type: ${attachment.mime}` }
      }
      const data = Buffer.from(attachment.dataBase64, 'base64')
      if (data.byteLength > 10 * 1024 * 1024) {
        return { ok: false as const, status: 413, message: 'Attachment too large (max 10 MB).' }
      }
      if (isDocument) {
        try {
          const text =
            attachment.mime === 'application/pdf'
              ? String(
                  (await (await import('unpdf')).extractText(await (await import('unpdf')).getDocumentProxy(new Uint8Array(data)), { mergePages: true })).text ?? '',
                )
              : data.toString('utf8')
          references.push({ name: attachment.name ?? 'document', text: text.slice(0, REFERENCE_CHARS) })
        } catch {
          return { ok: false as const, status: 422, message: `Could not read the document ${attachment.name ?? ''}.`.trim() }
        }
      }
      try {
        const stored = await engine.storage.putContentAddressed(data, attachment.mime)
        meta.push({ sha256: stored.sha256, mime: stored.mime, size: stored.size, key: stored.key })
      } catch {
        meta.push({ sha256: sha256Hex(data), mime: attachment.mime, size: data.byteLength, key: '' })
      }
    }
    return { ok: true as const, meta, references, images: (attachments ?? []).filter((a) => a.mime.startsWith('image/')) }
  }

  app.post('/v1/agents/ask', async (request, reply) => {
    const body = askBody.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const institution = institutionsForDomain(body.data.domain as Domain).find((i) => i.id === body.data.institutionId)
    if (!institution) return reply.status(404).send({ error: `Unknown institution "${body.data.institutionId}"` })

    const stored = await storeAttachments(body.data.attachments)
    if (!stored.ok) return reply.status(stored.status).send({ error: stored.message })

    return engine.orchestrator.runAgent({
      institution,
      question: body.data.question,
      country: body.data.country,
      domain: body.data.domain as Domain,
      lens: body.data.lens as WorkflowLens,
      language: body.data.language,
      runId: body.data.runId,
      attachments: stored.images,
      attachmentMeta: stored.meta,
      references: stored.references,
      userId: operatorOf(request).email,
    })
  })

  /**
   * Streaming twin of `/v1/agents/ask` (Server-Sent Events).
   *
   * Retrieval, validation and audit are the same code path; the browser gets
   * `stage` events for the processing bar, `delta` events for the answer as it
   * is written, and a final `done` event carrying the very same assessment
   * object the buffered route returns (citations and validation included).
   */
  app.post('/v1/agents/ask/stream', async (request, reply) => {
    const body = askBody.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const institution = institutionsForDomain(body.data.domain as Domain).find((i) => i.id === body.data.institutionId)
    if (!institution) return reply.status(404).send({ error: `Unknown institution "${body.data.institutionId}"` })

    const stored = await storeAttachments(body.data.attachments)
    if (!stored.ok) return reply.status(stored.status).send({ error: stored.message })

    reply.hijack()
    const raw = reply.raw
    const origin = request.headers.origin
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Any reverse proxy in front of the API: do not buffer the stream.
      'X-Accel-Buffering': 'no',
      // A hijacked response bypasses @fastify/cors, so the browser needs the
      // CORS header on the stream itself.
      'Access-Control-Allow-Origin': origin ?? '*',
      Vary: 'Origin',
    })
    raw.flushHeaders?.()

    const send = (payload: unknown) => {
      if (raw.writableEnded || raw.destroyed) return
      try {
        raw.write(`data: ${JSON.stringify(payload)}\n\n`)
      } catch {
        /* client went away · the run still completes for the audit trail */
      }
    }

    // A comment frame every 15 s keeps the proxy from closing an idle stream.
    const heartbeat = setInterval(() => {
      if (!raw.writableEnded && !raw.destroyed) raw.write(': ping\n\n')
    }, 15_000)

    try {
      send({ type: 'open', agentId: institution.id, runId: body.data.runId })
      const assessment = await engine.orchestrator.streamAgent(
        {
          institution,
          question: body.data.question,
          country: body.data.country,
          domain: body.data.domain as Domain,
          lens: body.data.lens as WorkflowLens,
          language: body.data.language,
          runId: body.data.runId,
          attachments: stored.images,
          attachmentMeta: stored.meta,
          references: stored.references,
          userId: operatorOf(request).email,
          withTools: true,
          actions: actionStore,
          mcp: mcpGateway,
          data: buildDataPort(operatorOf(request).email),
          ...(body.data.effort ? { effort: body.data.effort } : {}),
        },
        {
          onStage: (stage, detail) => send({ type: 'stage', stage, ...(detail ?? {}) }),
          onDelta: (text) => send({ type: 'delta', text }),
          onReasoning: (text) => send({ type: 'reasoning', text }),
          onTool: (event) => send(event),
          onUi: (ui) => send({ type: 'ui', ui }),
        },
      )
      send({ type: 'done', assessment })
    } catch (error) {
      send({ type: 'error', message: (error as Error).message })
    } finally {
      clearInterval(heartbeat)
      if (!raw.writableEnded) raw.end()
    }
  })

  /**
   * Correction of a dictated text by the chat model, from the sentence itself.
   * Falls back to the original text, so a dictation is never lost.
   */
  app.post('/v1/voice/correct', async (request, reply) => {
    const body = z.object({ text: z.string().min(1).max(4000) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    return correctTranscript(body.data.text, { model: engine.model })
  })

  /**
   * Auto routing: which institution a question belongs to, or several when it
   * clearly touches more than one. A short structured call; the chosen agent
   * then answers through the normal stream. Falls back to the first institution.
   */
  app.post('/v1/agents/route', async (request, reply) => {
    const body = z
      .object({
        question: z.string().min(3).max(2000),
        domains: z.array(z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture'])).min(1).max(5),
        /** Chosen institutions: the router picks among them only. Empty or absent: every institution of the sectors. */
        institutionIds: z.array(z.string().max(80)).max(10).optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const chosen = new Set(body.data.institutionIds ?? [])
    const institutions = institutionsForDomains(body.data.domains as Domain[]).filter((institution) => chosen.size === 0 || chosen.has(institution.id))
    if (institutions.length === 0) return reply.status(404).send({ error: 'No institution for these sectors.' })
    const known = new Set(institutions.map((institution) => institution.id))
    const fallback = { primary: institutions[0]!.id, others: [] as string[], reason: '' }
    try {
      const choice = await generateStructured({
        model: engine.model,
        system:
          'Route a policy question to the institutions whose mandate it concerns. Choose one institution, or two or three when the question clearly touches several. Use only the ids listed.',
        prompt: `QUESTION:\n${body.data.question}\n\nINSTITUTIONS:\n${institutions
          .map((institution) => `- ${institution.id}: ${institution.name}. ${institution.mandate.slice(0, 240)}`)
          .join('\n')}`,
        shape: '{"institutionIds": ["<id>"], "reason": "<one short sentence>"}',
        schema: z.object({
          institutionIds: z.array(z.string()).min(1).max(3),
          reason: z.string().default(''),
        }),
        attempts: 2,
        reasoningEffort: 'low',
        maxOutputTokens: 2048,
      })
      const picked = choice.institutionIds.filter((id) => known.has(id))
      if (picked.length === 0) return fallback
      return { primary: picked[0]!, others: picked.slice(1), reason: choice.reason }
    } catch (error) {
      request.log.error(error)
      return fallback
    }
  })

  // ── Scenarios: progressive release + multi-agent reconciliation ───────────

  function buildSession(country: string, domain: Domain, userId: string, lang: ScenarioLang = 'en'): ScenarioSession {
    const run = createScenario(scenarioFor(domain, country, lang), 'simulation').toRun()
    return {
      runId: `${run.id}-${crypto.randomUUID()}`,
      userId,
      country,
      domain,
      lang,
      institutions: institutionsForDomain(domain),
      events: run.events,
      ticks: [...new Set(run.events.map((e) => e.releaseChunk))].sort((a, b) => a - b),
      released: 0,
      history: [],
      reports: [],
    }
  }

  /**
   * Rebuilds a facilitator session from its saved run.
   *
   * The session map lives in memory: after a restart, or on another instance, the
   * entry is gone while the run itself is saved. Rebuilding it from the record keeps
   * the next batch, the read and the resume working instead of answering 404.
   */
  function sessionFromRecord(record: ScenarioRunRecord): ScenarioSession {
    const session = buildSession(record.country, record.domain as Domain, record.userId, record.lang)
    session.runId = record.id
    session.released = record.released
    session.reports = [...record.reports]
    session.history = session.events.filter((event) => session.ticks.slice(0, record.released).includes(event.releaseChunk))
    return session
  }

  /** Release the next tick (facilitator gate) and reconcile it. */
  async function releaseNext(session: ScenarioSession) {
    if (session.released >= session.ticks.length) return { done: true as const, tick: null, report: null }
    const tick = session.ticks[session.released]!
    const events = session.events.filter((e) => e.releaseChunk === tick)
    session.history.push(...events)

    const assessments = await engine.coordinator.runTick({
      language: session.lang,
      runId: session.runId,
      userId: session.userId,
      tick,
      country: session.country,
      domain: session.domain,
      lens: 'simulation',
      institutions: session.institutions,
      events,
      history: [...session.history],
    })
    const report = await engine.coordinator.reconcile({
      language: session.lang,
      runId: session.runId,
      userId: session.userId,
      tick,
      country: session.country,
      domain: session.domain,
      assessments,
    })
    session.reports.push(report)
    session.released += 1
    await engine.reports.saveReports(session.runId, session.reports, session.userId)
    const done = session.released >= session.ticks.length
    await scenarioRuns.update(session.runId, session.userId, {
      released: session.released,
      reports: session.reports,
      status: done ? 'complete' : 'running',
    })
    return { done, tick, report }
  }

  /** Saves a new run; its progress is then saved tick by tick. */
  async function recordScenarioRun(session: ScenarioSession) {
    const scenario = scenarioFor(session.domain, session.country, session.lang)
    await scenarioRuns.create({
      id: session.runId,
      userId: session.userId,
      country: session.country,
      domain: session.domain,
      lang: session.lang,
      title: scenario.title,
      released: session.released,
      total: session.ticks.length,
      reports: session.reports,
      status: 'running',
    })
  }

  /** A run that stops on an error is kept as failed, with the reason, and can be resumed. */
  async function failScenarioRun(runId: string, userId: string, error: unknown) {
    await scenarioRuns.update(runId, userId, { status: 'failed', failure: (error as Error).message.slice(0, 300) })
  }

  async function dossierFor(runId: string, reports: JointSituationReport[], userId: string) {
    return buildRunDossier({
      runId,
      audit: await engine.audit.getAuditForRun(runId, userId),
      traces: await engine.audit.getTrace(runId, userId),
      reports,
      integrity: await engine.audit.verifyChain(),
    })
  }

  // SSE stream of all ticks (fixed delay) · for passive viewers.
  app.get('/v1/scenarios/:id/release', async (request, reply) => {
    const query = z.object({ country: z.string().default('cm') }).parse(request.query)
    const scenario = createScenario(scenarioFor('health', query.country), 'simulation')
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    for await (const batch of scenario.release({ chunkDelayMs: 800 })) {
      reply.raw.write(`data: ${JSON.stringify(batch)}\n\n`)
    }
    reply.raw.write('event: done\ndata: {}\n\n')
    reply.raw.end()
  })

  // Start a facilitator session (returns the agenda, not the content).
  app.post('/v1/scenarios/start', async (request, reply) => {
    const body = z
      .object({
        id: z.string().default('health-data-breach'),
        country: z.string().length(2).default('cm'),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']).default('health'),
        lang: z.enum(['fr', 'en']).default('en'),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const session = buildSession(body.data.country, body.data.domain as Domain, operatorOf(request).email, body.data.lang)
    scenarioSessions.set(session.runId, session)
    await recordScenarioRun(session)
    return {
      runId: session.runId,
      country: session.country,
      domain: session.domain,
      totalTicks: session.ticks.length,
      agents: session.institutions.map((i) => i.id),
      agenda: session.events.map((e) => ({
        sequence: e.sequence,
        releaseChunk: e.releaseChunk,
        title: e.title,
        visibleTo: e.visibleTo,
      })),
    }
  })

  // Release the next tick (the `onBeforeRelease` facilitator gate).
  app.post('/v1/scenarios/:runId/next', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const userId = operatorOf(request).email
    let session = scenarioSessions.get(runId)
    if (!session || session.userId !== userId) {
      const record = await scenarioRuns.get(runId, userId)
      if (!record) return reply.status(404).send({ error: `Unknown scenario session "${runId}"` })
      if (record.status === 'complete') return reply.status(409).send({ error: 'This run is already complete.' })
      session = sessionFromRecord(record)
      scenarioSessions.set(session.runId, session)
      if (record.status === 'failed') await scenarioRuns.update(record.id, userId, { status: 'running' })
    }

    let result: Awaited<ReturnType<typeof releaseNext>>
    try {
      result = await releaseNext(session)
    } catch (error) {
      await failScenarioRun(runId, session.userId, error)
      throw error
    }
    return {
      runId,
      releasedTicks: session.released,
      totalTicks: session.ticks.length,
      done: result.done,
      tick: result.tick,
      // The facts released in this chunk, as the incident timeline shows them.
      events: result.tick === null ? [] : session.events.filter((e) => e.releaseChunk === result.tick),
      report: result.report,
    }
  })

  /** The scenario runs of this operator, newest first. */
  app.get('/v1/scenarios/runs', async (request) => {
    return { runs: await scenarioRuns.list(operatorOf(request).email) }
  })

  /** One saved run: its status, what was released, the joint reports and the scenario's events. */
  app.get('/v1/scenarios/runs/:runId', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const record = await scenarioRuns.get(runId, operatorOf(request).email)
    if (!record) return reply.status(404).send({ error: 'Scenario run not found.' })
    const scenario = scenarioFor(record.domain as Domain, record.country, record.lang)
    return {
      ...record,
      agents: scenario.agents,
      events: scenario.events,
    }
  })

  /**
   * Deletes a saved run of the operator. The chain-of-thought traces and the audit
   * entries stay in the journal: the journal is the record of what was played, and
   * it is append-only.
   */
  app.delete('/v1/scenarios/runs/:runId', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const userId = operatorOf(request).email
    const deleted = await scenarioRuns.delete(runId, userId)
    if (!deleted) return reply.status(404).send({ error: 'Scenario run not found.' })
    scenarioSessions.delete(runId)
    return { deleted: true, id: runId }
  })

  /**
   * One saved run as a file: the raw JSON, Markdown, a self-contained HTML page,
   * or a Word document. The Word file is built by the docx MCP server, like the
   * readiness report.
   */
  app.get('/v1/scenarios/runs/:runId/export', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const query = z
      .object({ format: z.enum(['json', 'markdown', 'html', 'docx']).default('json') })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    const operator = operatorOf(request)
    const record = await scenarioRuns.get(runId, operator.email)
    if (!record) return reply.status(404).send({ error: 'Scenario run not found.' })
    try {
      return await buildScenarioExport({
        run: record,
        traces: await engine.audit.getTrace(runId, operator.email),
        format: query.data.format,
        mcp: mcpGateway,
      })
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /**
   * Resumes a failed or interrupted run from the last tick that was released: the
   * session is rebuilt from the saved progress, the released ticks are not replayed.
   */
  app.post('/v1/scenarios/runs/:runId/resume', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const userId = operatorOf(request).email
    const record = await scenarioRuns.get(runId, userId)
    if (!record) return reply.status(404).send({ error: 'Scenario run not found.' })
    if (record.status === 'complete') return reply.status(409).send({ error: 'This run is already complete.' })

    const session = sessionFromRecord(record)
    scenarioSessions.set(session.runId, session)
    await scenarioRuns.update(record.id, userId, { status: 'running' })
    return {
      runId: session.runId,
      country: session.country,
      domain: session.domain,
      released: session.released,
      totalTicks: session.ticks.length,
      agents: session.institutions.map((i) => i.id),
      agenda: session.events.map((e) => ({ sequence: e.sequence, releaseChunk: e.releaseChunk, title: e.title, visibleTo: e.visibleTo })),
    }
  })

  // Current state of a session.
  app.get('/v1/scenarios/:runId', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const userId = operatorOf(request).email
    let session = scenarioSessions.get(runId)
    if (!session || session.userId !== userId) {
      const record = await scenarioRuns.get(runId, userId)
      if (!record) return reply.status(404).send({ error: `Unknown scenario session "${runId}"` })
      session = sessionFromRecord(record)
      scenarioSessions.set(runId, session)
    }
    return {
      runId,
      country: session.country,
      domain: session.domain,
      releasedTicks: session.released,
      totalTicks: session.ticks.length,
      done: session.released >= session.ticks.length,
      reports: session.reports,
    }
  })

  // Auto-run: start + release every tick + dossier.
  app.post('/v1/scenarios/run', async (request, reply) => {
    const body = z
      .object({
        id: z.string().default('health-data-breach'),
        country: z.string().length(2).default('cm'),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']).default('health'),
        lang: z.enum(['fr', 'en']).default('en'),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const session = buildSession(body.data.country, body.data.domain as Domain, operatorOf(request).email, body.data.lang)
    scenarioSessions.set(session.runId, session)
    await recordScenarioRun(session)
    while (session.released < session.ticks.length) {
      try {
        await releaseNext(session)
      } catch (error) {
        await failScenarioRun(session.runId, session.userId, error)
        throw error
      }
    }
    const dossier = await dossierFor(session.runId, session.reports, session.userId)
    return {
      runId: session.runId,
      country: session.country,
      domain: session.domain,
      ticks: session.reports,
      events: session.events,
      dossier,
    }
  })

  // ── Readiness assessment ──────────────────────────────────────────────────
  app.post('/v1/readiness/report', async (request, reply) => {
    const body = z
      .object({
        country: z.string().length(2),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
        globalCountry: z.string().default('global'),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    return engine.readiness.assess({
      country: body.data.country,
      domain: body.data.domain as Domain,
      globalCountry: body.data.globalCountry,
    })
  })

  /**
   * Runs an assessment and streams its steps (Server-Sent Events). A run stopped by an
   * error is kept as `failed`, with the dimensions it had scored and the settings it ran
   * with, so it can be resumed. A resumed run keeps its identifier.
   */
  async function streamAssessment(
    request: FastifyRequest,
    reply: FastifyReply,
    input: ReadinessRunInput,
    resume?: ReadinessRun,
  ): Promise<void> {
    const operator = operatorOf(request)
    const total = input.dimensions?.length ?? 13
    const toSummary = (run: ReadinessRun): ReadinessRunSummary => {
      const { report: _report, input: _input, ...rest } = run
      return rest
    }
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
      Vary: 'Origin',
    })
    raw.flushHeaders?.()
    const send = (payload: unknown) => {
      if (raw.writableEnded || raw.destroyed) return
      raw.write(`data: ${JSON.stringify(payload)}\n\n`)
    }
    const heartbeat = setInterval(() => {
      if (!raw.writableEnded && !raw.destroyed) raw.write(': ping\n\n')
    }, 15_000)

    try {
      const report = await engine.readiness.assess(
        {
          country: input.country,
          domain: input.domain as Domain,
          globalCountry: input.globalCountry,
          ...(input.dimensions?.length ? { dimensions: input.dimensions as ReadinessDimension[] } : {}),
          ...(input.perDimensionK ? { perDimensionK: input.perDimensionK } : {}),
          ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
          ...(input.models ? { models: input.models } : {}),
          ...(input.concurrency ? { concurrency: input.concurrency } : {}),
          ...(input.concurrency === 'orchestrated'
            ? {
                ...(input.maxDecisions ? { maxDecisions: input.maxDecisions } : {}),
                ...(input.language ? { language: input.language } : {}),
                lead: (state: LeadState) =>
                  engine.coordinator.decideReadinessStep({ ...state, userId: operator.email }) as Promise<LeadDecision>,
              }
            : {}),
          ...(resume ? { completed: resume.report.scores } : {}),
        },
        (event) => send(event),
      )
      let summary: ReadinessRunSummary
      if (resume) {
        const updated = await readinessRuns.updateRun(resume.id, operator.email, { report, status: 'complete' })
        if (!updated) throw new Error('The assessment could not be saved.')
        summary = toSummary(updated)
      } else {
        summary = await readinessRuns.save({ userId: operator.email, runBy: operator.email, report, input })
      }
      await engine.audit.logAction({
        actor: operator.email,
        action: resume ? 'readiness.resumed' : 'readiness.assessed',
        target: `${report.country.toUpperCase()} · ${report.domain} · composite ${report.scenario?.composite ?? 'n/a'}/5`,
        lens: 'readiness',
        runId: summary.id,
        userId: operator.email,
      })
      send({ type: 'saved', run: summary })
    } catch (error) {
      if (error instanceof ReadinessInterrupted) {
        const scores = error.completed
        const partial: ReadinessReport = {
          country: input.country,
          domain: input.domain as Domain,
          generatedAt: new Date().toISOString(),
          dimensions: [],
          scores,
          scenario: buildScenario(input.country, input.domain as Domain, scores),
          summary: `Interrupted: ${scores.length} of ${total} dimensions scored.`,
        }
        const kept = resume
          ? await readinessRuns.updateRun(resume.id, operator.email, { report: partial, status: 'failed', failure: error.message })
          : await readinessRuns.save({ userId: operator.email, runBy: operator.email, report: partial, status: 'failed', failure: error.message, input })
        send({ type: 'failed', message: error.message, runId: kept?.id, completed: scores.length, total })
      } else {
        request.log.error(error)
        send({ type: 'failed', message: (error as Error).message })
      }
    } finally {
      clearInterval(heartbeat)
      if (!raw.writableEnded) raw.end()
    }
  }

  /**
   * Live assessment (Server-Sent Events): every step is sent as it happens, so the
   * console shows the process rather than a spinner. The finished run is saved to
   * the operator's history and announced with its id.
   */
  app.post('/v1/readiness/stream', async (request, reply) => {
    const body = z
      .object({
        country: z.string().length(2),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
        globalCountry: z.string().default('global'),
        dimensions: z.array(z.string().max(60)).min(1).max(13).optional(),
        perDimensionK: z.number().int().min(2).max(10).optional(),
        reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
        models: z
          .object({
            evaluate: z.string().min(1).max(80).optional(),
            synthesis: z.string().min(1).max(80).optional(),
          })
          .optional(),
        concurrency: z.enum(['parallel', 'sequential', 'orchestrated']).optional(),
        maxDecisions: z.number().int().min(1).max(50).optional(),
        language: z.enum(['fr', 'en']).optional(),
        batchId: z.string().min(8).max(80).optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const known = new Set(READINESS_DIMENSIONS.map((dimension) => dimension.shortName))
    const dimensions = body.data.dimensions?.filter((id) => known.has(id as ReadinessDimension))
    await streamAssessment(request, reply, {
      country: body.data.country,
      domain: body.data.domain,
      globalCountry: body.data.globalCountry,
      ...(dimensions?.length ? { dimensions } : {}),
      ...(body.data.perDimensionK ? { perDimensionK: body.data.perDimensionK } : {}),
      ...(body.data.reasoningEffort ? { reasoningEffort: body.data.reasoningEffort } : {}),
      ...(body.data.models ? { models: body.data.models } : {}),
      ...(body.data.concurrency ? { concurrency: body.data.concurrency } : {}),
      ...(body.data.maxDecisions && body.data.concurrency === 'orchestrated' ? { maxDecisions: body.data.maxDecisions } : {}),
      ...(body.data.language ? { language: body.data.language } : {}),
      ...(body.data.batchId ? { batchId: body.data.batchId } : {}),
    })
  })

  /** The assessments of one series (one per sector), oldest first, with their reports. */
  app.get('/v1/readiness/batches/:batchId', async (request) => {
    const { batchId } = request.params as { batchId: string }
    const operator = operatorOf(request)
    const runs = await readinessRuns.listBatch(operator.email, batchId)
    return { runs }
  })

  /** Resumes an interrupted assessment where it stopped: the dimensions already scored are kept. */
  app.post('/v1/readiness/runs/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string }
    const operator = operatorOf(request)
    const run = await readinessRuns.get(id, operator.email)
    if (!run) return reply.status(404).send({ error: 'Assessment not found.' })
    if (run.status !== 'failed' || !run.input) return reply.status(409).send({ error: 'Only an interrupted assessment can be resumed.' })
    await streamAssessment(request, reply, run.input, run)
  })

  /** Past assessments of this operator, newest first: one page, filtered on the server. */
  app.get('/v1/readiness/runs', async (request, reply) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(10),
        q: z.string().max(100).optional(),
        domain: z.string().max(300).optional(),
        status: z.string().max(60).optional(),
      })
      .safeParse(request.query ?? {})
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    const sectors = new Set<string>(['health', 'education', 'telecom', 'public_services', 'agriculture'])
    const domains = (query.data.domain ?? '').split(',').filter((value) => sectors.has(value))
    const statuses = (query.data.status ?? '')
      .split(',')
      .filter((value): value is 'complete' | 'failed' => value === 'complete' || value === 'failed')
    const operator = operatorOf(request)
    const { runs, total } = await readinessRuns.page(operator.email, {
      page: query.data.page,
      limit: query.data.limit,
      ...(query.data.q?.trim() ? { q: query.data.q } : {}),
      domains,
      statuses,
    })
    await engine.audit.logAction({
      actor: operator.email,
      action: 'readiness.history.viewed',
      target: `${runs.length} of ${total} assessment(s) listed (page ${query.data.page})`,
      lens: 'readiness',
      userId: operator.email,
    })
    return { runs, total, page: query.data.page, limit: query.data.limit }
  })

  app.get('/v1/readiness/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const operator = operatorOf(request)
    const run = await readinessRuns.get(id, operator.email)
    if (!run) return reply.status(404).send({ error: 'Assessment not found.' })
    await engine.audit.logAction({
      actor: operator.email,
      action: 'readiness.opened',
      target: `${run.country.toUpperCase()} · ${run.domain} · ${run.createdAt}`,
      lens: 'readiness',
      runId: run.id,
      userId: operator.email,
    })
    return run
  })

  /** Deletes one saved assessment of the operator (the console asks for confirmation first). */
  app.delete('/v1/readiness/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const operator = operatorOf(request)
    const run = await readinessRuns.get(id, operator.email)
    if (!run) return reply.status(404).send({ error: 'Assessment not found.' })
    await readinessRuns.delete(id, operator.email)
    await engine.audit.logAction({
      actor: operator.email,
      action: 'readiness.deleted',
      target: `${run.country.toUpperCase()} · ${run.domain} · ${run.createdAt}`,
      lens: 'readiness',
      runId: run.id,
      userId: operator.email,
    })
    return { deleted: true, id }
  })

  /**
   * Adds a language to a saved assessment: the text is translated once from the
   * text it has, then kept with the run. A language already present is returned as is.
   */
  app.post('/v1/readiness/runs/:id/localize', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ lang: z.enum(['fr', 'en']) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const operator = operatorOf(request)
    const run = await readinessRuns.get(id, operator.email)
    if (!run) return reply.status(404).send({ error: 'Assessment not found.' })
    if (hasLanguage(run.report.scores, body.data.lang)) return run
    const localized = await engine.readiness.localize(run.report, body.data.lang)
    const updated = await readinessRuns.updateRun(id, operator.email, { report: localized, status: run.status })
    await engine.audit.logAction({
      actor: operator.email,
      action: 'readiness.localized',
      target: `${body.data.lang} · ${run.country.toUpperCase()} · ${run.domain}`,
      lens: 'readiness',
      runId: run.id,
      userId: operator.email,
    })
    return updated ?? run
  })

  /** A report of a saved assessment, in the console's language, with the charts, diagram and cover it could produce. */
  app.post('/v1/readiness/runs/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z
      .object({ format: z.enum(['markdown', 'html', 'docx']), lang: z.enum(['fr', 'en']).optional() })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const operator = operatorOf(request)
    const run = await readinessRuns.get(id, operator.email)
    if (!run) return reply.status(404).send({ error: 'Assessment not found.' })
    const report = await buildReadinessReport(run, {
      format: body.data.format,
      lang: body.data.lang ?? 'fr',
      mcp: mcpGateway,
    })
    await engine.audit.logAction({
      actor: operator.email,
      action: 'readiness.report.generated',
      target: `${body.data.format} · ${body.data.lang ?? 'fr'} · ${report.assets.map((asset) => `${asset.kind}:${asset.status}`).join(' ')}`,
      lens: 'readiness',
      runId: run.id,
      userId: operator.email,
    })
    return report
  })

  // ── Readiness what-if (causal propagation across dimensions) ──────────────
  app.post('/v1/readiness/whatif', async (request, reply) => {
    const body = z
      .object({
        country: z.string().length(2),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
        changes: z.record(z.string(), z.number()),
        /** Optional baseline; if omitted, a full assessment is run first. */
        scores: z.array(z.any()).optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const baseline =
      (body.data.scores as Parameters<typeof whatIf>[0]['scores'] | undefined) ??
      (await engine.readiness.assess({ country: body.data.country, domain: body.data.domain as Domain })).scores

    return whatIf({
      country: body.data.country,
      domain: body.data.domain as Domain,
      scores: baseline,
      changes: body.data.changes as Parameters<typeof whatIf>[0]['changes'],
    })
  })

  // ── N3: scanned gazette ingestion ─────────────────────────────────────────
  // A gazette has no text layer. The page is segmented geometrically and every
  // zone is transcribed by the on-premise Tesseract service. The response
  // carries page/column/bbox provenance for every line, so the console can show
  // what was read where.
  app.post('/v1/gazette/analyze', { bodyLimit: 20 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(200),
        imageBase64: z.string().min(1),
        mime: z.enum(['image/png', 'image/jpeg']).optional(),
        page: z.number().int().min(1).max(10_000).default(1),
        sourceUrl: z.string().url().optional(),
        maxZones: z.number().int().min(1).max(48).default(24),
        concurrency: z.number().int().min(1).max(8).default(4),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const bytes = Buffer.from(body.data.imageBase64.replace(/^data:[^,]+,/, ''), 'base64')
    if (bytes.byteLength === 0) return reply.status(400).send({ error: 'Empty image.' })
    if (bytes.byteLength > GAZETTE_MAX_BYTES) {
      return reply.status(413).send({ error: 'Page too large (max 12 MB per page).' })
    }

    try {
      const page = await analyzeGazettePage({
        bytes,
        ...(body.data.mime ? { mime: body.data.mime } : {}),
        filename: body.data.filename,
        page: body.data.page,
        ...(body.data.sourceUrl ? { sourceUrl: body.data.sourceUrl } : {}),
        modelLabel: 'tesseract',
        provider: {
          mode: 'local',
          servedBy: 'Tesseract OCR',
          residency: 'on-premise',
          openWeights: true,
          models: { reasoning: 'tesseract', vision: 'tesseract', embedding: config.embeddings.model },
        },
        ocr: new OcrClient({ baseUrl: config.ocr.url, ...(config.serviceApiKey ? { apiKey: config.serviceApiKey } : {}) }),
        maxZones: body.data.maxZones,
        concurrency: body.data.concurrency,
      })

      // The page image is content-addressed and kept with the analysis, so a
      // citation opened months later still resolves to the exact scan.
      try {
        await engine.storage.putContentAddressed(Buffer.from(bytes), page.image.mime)
      } catch {
        // Object storage is optional; provenance keeps the sha256 regardless.
      }

      return page
    } catch (error) {
      request.log.error(error)
      return reply.status(422).send({ error: (error as Error).message })
    }
  })

  // Push a transcribed page into the knowledge base. One document per page keeps
  // the ingestion service's structural chunker in charge; every zone heading and
  // the page-level source URL survive in the chunk text.
  app.post('/v1/gazette/ingest', async (request, reply) => {
    const body = z
      .object({
        page: z.custom<GazettePage>((value) => {
          const candidate = value as Partial<GazettePage> | null
          return Boolean(candidate && typeof candidate.documentId === 'string' && Array.isArray(candidate.regions))
        }, 'Expected a page returned by /v1/gazette/analyze.'),
        country: z.string().length(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().default('regulation'),
        namespace: z.string().optional(),
        version: z.string().optional(),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const chunks = toKbChunks(body.data.page, {
      country: body.data.country,
      jurisdiction: body.data.jurisdiction,
      docType: body.data.docType as DocType,
      ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
      ...(body.data.version ? { version: body.data.version } : {}),
    })
    if (chunks.length === 0) {
      return reply.status(422).send({ error: 'No readable text on this page; nothing to ingest.' })
    }

    const text = chunks.map((chunk) => `## ${chunk.headingPath}\n\n${chunk.text}`).join('\n\n')
    const sourceUrl = chunks[0]!.sourceUrl
    try {
      const result = await ingestText({
        text,
        filename: body.data.page.filename,
        country: body.data.country,
        jurisdiction: body.data.jurisdiction,
        docType: body.data.docType as DocType,
        ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
        ...(body.data.version ? { version: body.data.version } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
      })
      return {
        documentId: body.data.page.documentId,
        page: body.data.page.page,
        zones: chunks.length,
        sourceUrl,
        ...result,
      }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: `Ingestion service unavailable: ${(error as Error).message}` })
    }
  })

  // ── Action center: side effects proposed by the agent, decided by the operator
  // The operator only ever sees and decides their own actions; the decision is
  // written to the audit trail whatever its outcome.
  app.get('/v1/actions', async (request) => {
    return { actions: await actionStore.list(operatorOf(request).email) }
  })

  app.post('/v1/actions/:id/decision', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ decision: z.enum(['approve', 'reject']) }).safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const operator = operatorOf(request).email
    try {
      const record = await actionStore.decide(id, operator, body.data.decision)
      await engine.audit.logAction({
        actor: operator,
        action: `action.${body.data.decision}`,
        target: `${record.kind}: ${record.title}`,
        lens: 'hybrid',
        runId: record.runId,
        userId: operator,
      })
      return record
    } catch (error) {
      if (error instanceof ActionError && error.code === 'not_found') return reply.status(404).send({ error: error.code, message: error.message })
      if (error instanceof ActionError && error.code === 'already_decided') return reply.status(409).send({ error: error.code, message: error.message })
      request.log.error(error)
      return reply.status(500).send({ error: 'action_failed', message: (error as Error).message })
    }
  })

  // ── Chat sessions: the operator's saved conversations with the assistant ──
  app.get('/v1/chat/sessions', async (request) => {
    return { sessions: await chatSessions.list(operatorOf(request).email) }
  })

  app.get('/v1/chat/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = await chatSessions.get(id, operatorOf(request).email)
    if (!session) return reply.status(404).send({ error: 'not_found' })
    return session
  })

  app.put('/v1/chat/sessions/:id', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z
      .object({
        title: z.string().min(1).max(200),
        turns: z.array(z.record(z.string(), z.unknown())).max(200),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return reply.status(400).send({ error: 'invalid_id' })
    return chatSessions.save({ id, userId: operatorOf(request).email, ...body.data })
  })

  app.delete('/v1/chat/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const removed = await chatSessions.remove(id, operatorOf(request).email)
    if (!removed) return reply.status(404).send({ error: 'not_found' })
    return { deleted: true }
  })

  // ── N6: voice notes as timed facts ────────────────────────────────────────
  // The clip is transcribed by the on-premise faster-whisper service. Nothing
  // leaves the machine; the response is the same transcript + turns, and
  // `facts` puts each turn on the incident timeline with its offset.
  app.post('/v1/voice/transcribe', { bodyLimit: 44 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        audioBase64: z.string().min(1),
        filename: z.string().min(1).max(200).default('note.wav'),
        mode: z.enum(['PUSH_TO_TALK', 'ENDPOINTING', 'DIARIZATION']).default('ENDPOINTING'),
        languageBias: z.array(z.string().min(2).max(40)).max(4).optional(),
        keywords: z.array(z.string().min(1).max(60)).max(32).optional(),
        sessionId: z.string().min(1).max(80).optional(),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const audio = Buffer.from(body.data.audioBase64.replace(/^data:[^,]+,/, ''), 'base64')
    if (audio.byteLength === 0) return reply.status(400).send({ error: 'Empty audio.' })
    if (audio.byteLength > 32 * 1024 * 1024) {
      return reply.status(413).send({ error: 'Audio too large (max 32 MB per recording).' })
    }

    const client = new LocalAsrClient({
      baseUrl: config.transcription.url,
      apiKey: config.serviceApiKey,
      model: 'faster-whisper',
    })

    try {
      const transcript = await client.transcribe({
        audio,
        filename: body.data.filename,
        mode: body.data.mode as VoiceMode,
        ...(body.data.languageBias ? { languageBias: body.data.languageBias } : {}),
        ...(body.data.keywords ? { keywords: body.data.keywords } : {}),
        ...(body.data.sessionId ? { sessionId: body.data.sessionId } : {}),
      })
      return { ...transcript, facts: toVoiceFacts(transcript) }
    } catch (error) {
      request.log.error({ message: (error as Error).message }, 'voice transcription failed')
      return reply.status(422).send({ error: (error as Error).message, relayed: false })
    }
  })

  // ── N7: legislative impact on open incidents ──────────────────────────────
  // A new provision does not open a new case: it re-opens the ones already
  // persisted. Candidate runs are selected deterministically (same article and
  // instrument) and the model only ranks and explains them.
  app.post('/v1/impact/analyze', async (request, reply) => {
    const body = z
      .object({
        provision: z.object({
          title: z.string().min(1).max(300),
          text: z.string().min(1).max(20_000),
          articleNumber: z.string().max(80).optional(),
          docType: z.string().max(40).optional(),
          sourceUrl: z.string().url().optional(),
          effectiveDate: z.string().max(40).optional(),
        }),
        runIds: z.array(z.string().min(1)).min(1).max(20),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const operator = operatorOf(request)
    const cases = []
    for (const runId of body.data.runIds) {
      const reports = await engine.reports.getReports(runId, operator.email).catch(() => [])
      if (reports.length === 0) continue
      const session = scenarioSessions.get(runId)
      if (session && session.userId !== operator.email) continue
      cases.push({
        runId,
        country: reports[0]!.country,
        domain: reports[0]!.domain,
        reports: reports.length,
        citations: reports.flatMap((report) => report.citations),
        facts: session ? session.history.map((event) => `${event.title}: ${event.payload}`) : [],
      })
    }
    if (cases.length === 0) {
      return reply.status(404).send({ error: 'No persisted reports for those run ids.' })
    }

    try {
      const analysis = await analyzeImpact({
        model: engine.model,
        modelLabel: engine.provider.models.reasoning,
        provision: body.data.provision,
        cases,
      })
      try {
        await engine.audit.logAction({
          actor: 'system',
          userId: operatorOf(request).email,
          action: 'impact.analyzed',
          target: `provision:${body.data.provision.title}:${body.data.provision.articleNumber ?? '-'}`,
          lens: 'hybrid',
        })
      } catch {
        // The analysis is still returned when the audit store is unreachable.
      }
      return analysis
    } catch (error) {
      request.log.error(error)
      return reply.status(422).send({ error: (error as Error).message })
    }
  })

  // ── Approval links ────────────────────────────────────────────────────────
  // The request is delivered by the console's local e-mail transport; the
  // decision itself is taken here, on the signed page. Single use is enforced
  // by the `approvals` collection: a replay returns the recorded decision.
  app.get('/v1/approvals/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(4096) }).parse(request.params)
    const verdict = verifyApprovalToken(token, config.approvals.secret)
    if (!verdict.ok) {
      return reply.status(verdict.reason === 'expired' ? 410 : 400).send({ error: verdict.reason })
    }

    const record = await approvals.get(verdict.claims.jti)
    const reports = await engine.reports.getReports(verdict.claims.runId, verdict.claims.userId).catch(() => [])
    return {
      runId: verdict.claims.runId,
      subject: verdict.claims.subject ?? null,
      expiresAt: new Date(verdict.claims.exp * 1000).toISOString(),
      decision: record?.decision ?? null,
      decidedAt: record?.decidedAt ?? null,
      note: record?.note ?? null,
      reports: reports.map((report) => ({
        tick: report.tick,
        summary: report.summary,
        conflicts: report.conflicts.length,
        citations: report.citations.length,
      })),
    }
  })

  app.post('/v1/approvals/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(4096) }).parse(request.params)
    const body = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        note: z.string().max(1000).optional(),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const verdict = verifyApprovalToken(token, config.approvals.secret)
    if (!verdict.ok) {
      return reply.status(verdict.reason === 'expired' ? 410 : 400).send({ error: verdict.reason })
    }

    const decision = body.data.decision as ApprovalDecision
    const decidedAt = new Date().toISOString()
    const result = await approvals.decide({
      jti: verdict.claims.jti,
      runId: verdict.claims.runId,
      ...(verdict.claims.userId ? { userId: verdict.claims.userId } : {}),
      decision,
      ...(body.data.note ? { note: body.data.note } : {}),
      decidedAt,
      channel: 'email',
    })
    if (!result.ok) {
      return reply.status(409).send({
        error: 'already_decided',
        decision: result.existing.decision,
        decidedAt: result.existing.decidedAt,
      })
    }

    try {
      await engine.audit.logAction({
        actor: 'operator',
        ...(verdict.claims.userId ? { userId: verdict.claims.userId } : {}),
        action: 'approval.decided',
        target: `run:${verdict.claims.runId}:${decision}`,
        lens: 'hybrid',
        runId: verdict.claims.runId,
      })
    } catch {
      // The decision is recorded; an unreachable audit store must not replay it.
    }

    return { recorded: true, decision, decidedAt }
  })

  /** Messages the console transport wrote instead of sending over the network. */
  app.get('/v1/notifications/outbox', async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(request.query)
    if (!query.success) return { messages: [] }
    return { messages: await listMailOutbox(query.data.limit) }
  })

  // ── Operator notifications (e-mail, console transport) ────────────────────
  // One address book, one channel. A contact consents to e-mail; a send only
  // goes to contacts whose consent is on. Every send is written to the audit
  // chain with the address masked: the journal proves who was notified, not
  // their full address. Nothing is relayed to an outside provider.
  const contactSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200).optional(),
    country: z.string().trim().length(2).optional(),
    channels: z.object({ email: z.boolean() }).optional(),
  })

  const maskEmail = (value: string): string => {
    const [local = '', domain = ''] = value.split('@')
    if (!domain) return '•'
    const head = local.slice(0, 1) || '•'
    return `${head}${'•'.repeat(Math.max(2, local.length - 1))}@${domain}`
  }

  const contactDto = (contact: NotificationContact) => ({ ...contact })

  /** Validates one contact payload once, for both create and update. */
  const prepareContact = (input: z.infer<typeof contactSchema>) => {
    if (!input.email) {
      return { ok: false as const, status: 400, body: { error: 'email_required' } }
    }

    const channels = input.channels ?? { email: true }
    if (channels.email && !input.email) {
      return { ok: false as const, status: 400, body: { error: 'email_consent_without_email' } }
    }

    return {
      ok: true as const,
      value: {
        name: input.name,
        email: input.email.toLowerCase(),
        ...(input.country ? { country: input.country } : {}),
        channels,
      },
    }
  }

  app.get('/v1/notifications/contacts', async () => {
    const contacts = await notificationContacts.list()
    return { contacts: contacts.map(contactDto) }
  })

  app.post('/v1/notifications/contacts', async (request, reply) => {
    const parsed = contactSchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const prepared = prepareContact(parsed.data)
    if (!prepared.ok) return reply.status(prepared.status).send(prepared.body)

    const duplicate = await notificationContacts.duplicate({ email: prepared.value.email })
    if (duplicate) {
      return reply.status(409).send({
        error: 'duplicate',
        contact: { id: duplicate.id, name: duplicate.name },
      })
    }

    const contact = await notificationContacts.add({
      ...prepared.value,
      createdBy: operatorOf(request).email,
    })

    await engine.audit
      .logAction({
        actor: 'operator',
        userId: operatorOf(request).email,
        action: 'notification.contact_added',
        target: `${contact.name} · ${contact.email ?? 'email'}`,
        lens: 'hybrid',
      })
      .catch(() => undefined)

    return reply.status(201).send({ contact: contactDto(contact) })
  })

  app.put('/v1/notifications/contacts/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params)
    const parsed = contactSchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const existing = await notificationContacts.get(id)
    if (!existing) return reply.status(404).send({ error: 'not_found' })

    const prepared = prepareContact(parsed.data)
    if (!prepared.ok) return reply.status(prepared.status).send(prepared.body)

    const duplicate = await notificationContacts.duplicate({ email: prepared.value.email }, id)
    if (duplicate) {
      return reply.status(409).send({
        error: 'duplicate',
        contact: { id: duplicate.id, name: duplicate.name },
      })
    }

    const contact = await notificationContacts.update(id, prepared.value)
    if (!contact) return reply.status(404).send({ error: 'not_found' })

    await engine.audit
      .logAction({
        actor: 'operator',
        userId: operatorOf(request).email,
        action: 'notification.contact_updated',
        target: `${contact.name} · ${contact.email ?? 'email'}`,
        lens: 'hybrid',
      })
      .catch(() => undefined)

    return { contact: contactDto(contact) }
  })

  app.delete('/v1/notifications/contacts/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params)
    const removed = await notificationContacts.remove(id)
    if (!removed) return reply.status(404).send({ error: 'not_found' })
    await engine.audit
      .logAction({
        actor: 'operator',
        userId: operatorOf(request).email,
        action: 'notification.contact_removed',
        target: id,
        lens: 'hybrid',
      })
      .catch(() => undefined)
    return { removed: true }
  })

  // ── Country & sector registry ─────────────────────────────────────────────
  // One row per jurisdiction, with the sectors enabled for it. Shared across
  // operators, seedable from the corpus, and guarded so the console cannot end
  // up with no active country or delete a country its runs still reference.
  const countryCodeSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}$/)

  const countrySectorsSchema = z
    .enum(COUNTRY_SECTORS as unknown as [Domain, ...Domain[]])
    .array()
    .min(1)
    .max(COUNTRY_SECTORS.length)

  const countryBodySchema = z.object({
    code: countryCodeSchema,
    name: z.string().trim().min(2).max(80),
    nameFr: z.string().trim().min(2).max(80).optional(),
    jurisdiction: z.enum(['national', 'regional', 'international']).optional(),
    region: z.string().trim().max(80).optional(),
    authority: z.string().trim().max(120).optional(),
    currency: z.string().trim().max(8).optional(),
    languages: z.array(z.string().trim().min(2).max(8)).max(6).optional(),
    timezone: z.string().trim().max(60).optional(),
    status: z.enum(['active', 'planned']).optional(),
    notes: z.string().trim().max(600).optional(),
    sectors: countrySectorsSchema.optional(),
  })

  const countryPatchSchema = countryBodySchema.omit({ code: true }).partial()

  const countryDto = (country: CountryRecord) => ({ ...country, notes: country.notes ?? null })

  /** Mean of the non-null composites, one decimal; null when nothing is scored. */
  const meanComposite = (runs: Array<{ composite: number | null }>): number | null => {
    const values = runs.map((run) => run.composite).filter((value): value is number => typeof value === 'number')
    if (values.length === 0) return null
    return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
  }

  app.get('/v1/countries', async () => {
    return { countries: (await countries.list()).map(countryDto) }
  })

  app.post('/v1/countries', async (request, reply) => {
    const parsed = countryBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const country = await countries.add({ ...parsed.data, createdBy: operatorOf(request).email })
    if (!country) return reply.status(409).send({ error: 'duplicate_code' })

    await engine.audit
      .logAction({
        actor: 'operator',
        userId: operatorOf(request).email,
        action: 'country.created',
        target: `${country.code} · ${country.name}`,
        lens: 'readiness',
      })
      .catch(() => undefined)

    return reply.status(201).send({ country: countryDto(country) })
  })

  app.get('/v1/countries/:code', async (request, reply) => {
    const { code } = z.object({ code: countryCodeSchema }).parse(request.params)
    const country = await countries.get(code)
    if (!country) return reply.status(404).send({ error: 'not_found' })
    return { country: countryDto(country) }
  })

  app.patch('/v1/countries/:code', async (request, reply) => {
    const { code } = z.object({ code: countryCodeSchema }).parse(request.params)
    const parsed = countryPatchSchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const country = await countries.update(code, parsed.data)
    if (!country) return reply.status(404).send({ error: 'not_found' })

    await engine.audit
      .logAction({
        actor: 'operator',
        userId: operatorOf(request).email,
        action: 'country.updated',
        target: `${country.code} · ${country.name}`,
        lens: 'readiness',
      })
      .catch(() => undefined)

    return { country: countryDto(country) }
  })

  app.put('/v1/countries/:code/sectors', async (request, reply) => {
    const { code } = z.object({ code: countryCodeSchema }).parse(request.params)
    const parsed = z.object({ sectors: countrySectorsSchema }).safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const country = await countries.setSectors(code, parsed.data.sectors)
    if (!country) return reply.status(404).send({ error: 'not_found' })

    await engine.audit
      .logAction({
        actor: 'operator',
        userId: operatorOf(request).email,
        action: 'country.sectors_updated',
        target: `${country.code} · ${country.sectors.join(',')}`,
        lens: 'readiness',
      })
      .catch(() => undefined)

    return { country: countryDto(country) }
  })

  app.delete('/v1/countries/:code', async (request, reply) => {
    const { code } = z.object({ code: countryCodeSchema }).parse(request.params)
    const country = await countries.get(code)
    if (!country) return reply.status(404).send({ error: 'not_found' })

    const all = await countries.list()
    if (country.status === 'active' && all.filter((row) => row.status === 'active').length <= 1) {
      return reply.status(409).send({ error: 'last_active_country' })
    }

    const [readinessCount, scenarioCount] = await Promise.all([
      readinessRuns.countForCountry(code),
      scenarioRuns.countForCountry(code),
    ])
    if (readinessCount + scenarioCount > 0) {
      return reply.status(409).send({
        error: 'country_in_use',
        readinessRuns: readinessCount,
        scenarioRuns: scenarioCount,
      })
    }

    await countries.remove(code)
    await engine.audit
      .logAction({
        actor: 'operator',
        userId: operatorOf(request).email,
        action: 'country.removed',
        target: `${country.code} · ${country.name}`,
        lens: 'readiness',
      })
      .catch(() => undefined)

    return { removed: true }
  })

  /** Country dashboard: what the runs and the corpus say, sector by sector. */
  app.get('/v1/countries/:code/insights', async (request, reply) => {
    const { code } = z.object({ code: countryCodeSchema }).parse(request.params)
    const country = await countries.get(code)
    if (!country) return reply.status(404).send({ error: 'not_found' })

    const [runs, scenarioRows, knowledgeStatus] = await Promise.all([
      readinessRuns.byCountry(code, 200),
      scenarioRuns.byCountry(code, 200),
      knowledge.status().catch(() => null),
    ])

    const complete = runs.filter((run) => run.status === 'complete')
    const knowledgeRow = knowledgeStatus?.byCountry?.find((row) => row.value.toLowerCase() === code)

    const sectors = COUNTRY_SECTORS.map((sector) => {
      const sectorRuns = runs.filter((run) => run.domain === sector)
      const scored = sectorRuns.filter((run) => run.status === 'complete')
      return {
        sector,
        enabled: country.sectors.includes(sector),
        readinessRuns: sectorRuns.length,
        latestComposite: scored[0]?.composite ?? null,
        averageComposite: meanComposite(scored),
        scenarioRuns: scenarioRows.filter((row) => row.domain === sector).length,
      }
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const trend = Array.from({ length: 14 }, (_, index) => {
      const day = new Date(today)
      day.setDate(today.getDate() - (13 - index))
      const key = day.toISOString().slice(0, 10)
      const dayRuns = runs.filter((run) => run.createdAt.slice(0, 10) === key)
      return {
        date: key,
        readinessRuns: dayRuns.length,
        averageComposite: meanComposite(dayRuns.filter((run) => run.status === 'complete')),
      }
    })

    return {
      country: countryDto(country),
      insights: {
        totals: {
          sectors: country.sectors.length,
          availableSectors: COUNTRY_SECTORS.length,
          readinessRuns: runs.length,
          readinessComplete: complete.length,
          readinessFailed: runs.length - complete.length,
          readinessAverage: meanComposite(complete),
          scenarioRuns: scenarioRows.length,
          scenarioRunning: scenarioRows.filter((row) => row.status === 'running').length,
          scenarioComplete: scenarioRows.filter((row) => row.status === 'complete').length,
          scenarioFailed: scenarioRows.filter((row) => row.status === 'failed').length,
          knowledgeChunks: knowledgeRow?.chunks ?? 0,
          lastRunAt: runs[0]?.createdAt ?? null,
        },
        sectors,
        trend,
      },
    }
  })

  /** What the console can send with: the local transport, and the outbox size. */
  app.get('/v1/notifications/status', async () => ({
    email: { configured: mailConfigured(), from: mailFrom(), transport: 'console' as const },
    approvals: { configured: Boolean(config.approvals.secret), channel: 'email' as const },
  }))

  /**
   * Draft a notification summary from the run's latest joint report. The model
   * only rephrases facts already stored on the run; the operator edits before sending.
   */
  app.post('/v1/notifications/summary-suggestion', async (request, reply) => {
    const parsed = z
      .object({
        runId: z.string().trim().min(1).max(120),
        kind: z.enum(['joint_report', 'approval_request']).default('joint_report'),
        locale: z.enum(['en', 'fr']).default('en'),
      })
      .safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const run = await scenarioRuns.get(parsed.data.runId, operatorOf(request).email)
    if (!run) return reply.status(404).send({ error: 'run_not_found' })

    const latest = run.reports.at(-1)
    const facts = [
      `Run: ${run.title}`,
      `Run id: ${run.id}`,
      `Country: ${run.country} · Domain: ${run.domain} · Status: ${run.status}`,
      `Progress: ${run.released} of ${run.total} ticks released`,
      ...(latest
        ? [
            `Latest tick: ${latest.tick}`,
            `Joint report summary: ${latest.summary}`,
            ...(latest.agreements.length ? [`Agreements: ${latest.agreements.join(' | ')}`] : []),
            ...(latest.conflicts.length
              ? [`Conflicts: ${latest.conflicts.map((conflict) => conflict.summary).join(' | ')}`]
              : []),
            ...(latest.openQuestions.length
              ? [`Open questions: ${latest.openQuestions.join(' | ')}`]
              : []),
          ]
        : ['No joint report has been released yet.']),
    ].join('\n')

    const language = parsed.data.locale === 'fr' ? 'French' : 'English'
    const purpose =
      parsed.data.kind === 'approval_request'
        ? 'an approval request that ends with the decision expected from the reader'
        : 'a short situation update'
    const replies: string[] = []
    try {
      const object = await generateStructured({
        model: engine.model,
        system: `You write ${purpose} for an institutional e-mail notification. Use only the facts in the prompt: never invent names, figures, legal claims or a decision. Write in ${language}.`,
        prompt: `${facts}\n\nWrite one plain-text summary, at most 420 characters, no bullet list and no markdown.`,
        schema: z.object({ summary: z.string().trim().min(1).max(900) }),
        shape: '{"summary":"one paragraph"}',
        attempts: 2,
        reasoningEffort: 'low',
        // Reasoning tokens count against the budget: a small cap leaves the
        // visible reply empty on the local reasoning models.
        maxOutputTokens: 4096,
        onAttempt: ({ reply }) => {
          if (reply.trim()) replies.push(reply)
        },
      })
      return {
        runId: run.id,
        summary: object.summary,
        model: describeProvider(engine.provider),
        generatedAt: new Date().toISOString(),
      }
    } catch (error) {
      // Some replies carry a usable summary outside the JSON envelope: keep it
      // rather than failing the operator's click.
      const plain = replies.map((reply) => plainTextReply(reply)).find((text) => text !== null)
      if (plain) {
        return {
          runId: run.id,
          summary: plain,
          model: describeProvider(engine.provider),
          generatedAt: new Date().toISOString(),
        }
      }
      // Log the reason for the operator's administrator, never the provider body.
      request.log.warn(
        { reason: (error as Error).message, model: describeProvider(engine.provider) },
        'notification summary suggestion failed',
      )
      return reply.status(502).send({ error: 'suggestion_failed' })
    }
  })

  const emailSendSchema = z
    .object({
      contactIds: z.array(z.string().min(1)).min(1).max(50),
      subject: z.string().trim().min(1).max(160),
      heading: z.string().trim().min(1).max(160).optional(),
      intro: z.string().trim().max(300).optional(),
      message: z.string().trim().min(1).max(5_000),
      ctaLabel: z.string().trim().min(1).max(60).optional(),
      ctaUrl: z.string().url().max(2_000).optional(),
      locale: z.enum(['fr', 'en']).optional(),
    })
    .refine((value) => Boolean(value.ctaLabel) === Boolean(value.ctaUrl), {
      message: 'cta_incomplete',
      path: ['ctaUrl'],
    })

  app.post('/v1/notifications/email', async (request, reply) => {
    const parsed = emailSendSchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    if (!mailConfigured()) return reply.status(503).send({ error: 'mail_not_configured' })

    const body = parsed.data
    const contacts = await notificationContacts.getMany(body.contactIds)
    const skipped: Array<{ contactId: string; name: string; reason: string }> = []
    const eligible = contacts.filter((contact) => {
      if (!contact.email) {
        skipped.push({ contactId: contact.id, name: contact.name, reason: 'no_email' })
        return false
      }
      if (!contact.channels.email) {
        skipped.push({ contactId: contact.id, name: contact.name, reason: 'no_email_consent' })
        return false
      }
      return true
    })

    const sent: Array<{ contactId: string; name: string; to: string; messageId: string | null }> = []
    const failed: Array<{ contactId: string; name: string; to: string; error: string }> = []

    for (const contact of eligible) {
      const address = contact.email as string
      try {
        const result = await sendNotificationEmail({
          to: address,
          subject: body.subject,
          heading: body.heading ?? body.subject,
          ...(body.intro ? { intro: body.intro } : {}),
          message: body.message,
          ...(body.ctaLabel && body.ctaUrl ? { cta: { label: body.ctaLabel, url: body.ctaUrl } } : {}),
          ...(body.locale ? { locale: body.locale } : {}),
          note:
            body.locale === 'fr'
              ? 'Vous recevez ce message parce que vous avez consenti à recevoir les notifications de la cellule de coordination.'
              : 'You receive this message because you consented to notifications from the coordination cell.',
        })
        sent.push({ contactId: contact.id, name: contact.name, to: maskEmail(address), messageId: result.id ?? null })
        await engine.audit
          .logAction({
            actor: 'operator',
            userId: operatorOf(request).email,
            action: 'notification.email_sent',
            target: `${contact.name} · ${maskEmail(address)} · ${body.subject}`,
            lens: 'hybrid',
          })
          .catch(() => undefined)
      } catch (error) {
        failed.push({ contactId: contact.id, name: contact.name, to: maskEmail(address), error: (error as Error).message })
      }
    }

    return { subject: body.subject, sent, failed, skipped }
  })

  // ── N8: table-top crisis exercise ─────────────────────────────────────────
  // Injects are released at fixed minutes; the after-action report is computed
  // from the action log first, then narrated by the model. The model never
  // decides whether an inject was addressed.
  app.get('/v1/exercise/sample', async (request) => {
    const query = z.object({ country: z.string().min(2).max(2).default('cm') }).parse(request.query ?? {})
    return healthBreachExercise(query.country)
  })

  const exerciseInjectSchema = z.object({
    id: z.string().min(1).max(80),
    atMinute: z.number().int().min(0).max(1_440),
    title: z.string().min(1).max(200),
    detail: z.string().min(1).max(4_000),
    visibleTo: z.array(z.string().min(1).max(80)).min(1).max(20),
    expectedAction: z.string().min(1).max(500),
    responseWindowMinutes: z.number().int().min(1).max(240).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  })

  const exerciseSchema = z.object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    country: z.string().min(2).max(2),
    domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
    scenarioRunId: z.string().min(1).max(120).optional(),
    durationMinutes: z.number().int().min(5).max(480),
    injects: z.array(exerciseInjectSchema).min(1).max(40),
    references: z
      .array(z.object({ title: z.string().min(1).max(300), authority: z.string().max(200).optional(), documentId: z.string().max(120).optional() }))
      .max(20)
      .optional(),
  })

  const exerciseLogSchema = z.object({
    id: z.string().min(1).max(80).optional(),
    atMinute: z.number().int().min(0).max(1_440),
    actor: z.string().min(1).max(120),
    kind: z.enum(['action', 'decision', 'escalation', 'note']),
    text: z.string().min(1).max(2_000),
    injectId: z.string().min(1).max(80).optional(),
  })

  const exerciseBodySchema = z.object({
    definition: exerciseSchema,
    actions: z.array(exerciseLogSchema).max(500).default([]),
    evaluatedAtMinute: z.number().int().min(0).max(1_440),
    lang: z.enum(['fr', 'en']).default('en'),
  })

  app.post('/v1/exercise/evaluate', async (request, reply) => {
    const parsed = exerciseBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    return evaluateExercise(
      parsed.data.definition as ExerciseDefinition,
      parsed.data.actions,
      parsed.data.evaluatedAtMinute,
    )
  })

  app.get('/v1/exercise/reports', async (request, reply) => {
    const query = z.object({ exerciseId: z.string().min(1).max(120) }).safeParse(request.query ?? {})
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    return { reports: await exerciseReports.list(operatorOf(request).email, query.data.exerciseId) }
  })

  app.get('/v1/exercise/reports/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const record = await exerciseReports.get(id, operatorOf(request).email)
    if (!record) return reply.status(404).send({ error: 'report_not_found' })
    return record
  })

  app.post('/v1/exercise/after-action', async (request, reply) => {
    const parsed = exerciseBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const definition = parsed.data.definition as ExerciseDefinition
    const lang = parsed.data.lang
    try {
      const [report, images] = await Promise.all([
        writeAfterAction({
          model: engine.model,
          modelLabel: describeProvider(engine.provider),
          definition,
          log: parsed.data.actions,
          evaluatedAtMinute: parsed.data.evaluatedAtMinute,
          lang,
        }),
        exerciseFigures(definition, lang),
      ])
      const withImages = { ...report, images }
      const saved = await exerciseReports.create({
        userId: operatorOf(request).email,
        exerciseId: definition.id,
        title: withImages.narrative.title || withImages.title,
        evaluatedAtMinute: parsed.data.evaluatedAtMinute,
        actionCount: parsed.data.actions.length,
        lang,
        model: withImages.model,
        definition,
        actions: parsed.data.actions,
        report: withImages,
      })
      try {
        await engine.audit.logAction({
          actor: 'facilitator',
          userId: operatorOf(request).email,
          action: 'exercise.after_action',
          target: `exercise:${definition.id}`,
          lens: 'simulation',
          runId: definition.scenarioRunId ?? definition.id,
        })
      } catch {
        // The report is still returned; an unreachable audit store must not erase it.
      }
      return { ...withImages, reportId: saved.id, version: saved.version, savedAt: saved.createdAt }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get('/v1/audit/chain', async () => engine.audit.verifyChain())
  app.get('/v1/audit/trace/:runId', async (request) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const operator = operatorOf(request)
    return { runId, trace: await engine.audit.getTrace(runId, operator.email) }
  })

  // ── Run dossier (audit + CoT + reports + citations) ───────────────────────
  app.get('/v1/audit/dossier/:runId', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const format = z.object({ format: z.enum(['json', 'markdown']).default('json') }).parse(request.query)

    const operator = operatorOf(request)
    const dossier = buildRunDossier({
      runId,
      audit: await engine.audit.getAuditForRun(runId, operator.email),
      traces: await engine.audit.getTrace(runId, operator.email),
      reports: await engine.reports.getReports(runId, operator.email),
      integrity: await engine.audit.verifyChain(),
    })

    if (format.format === 'markdown') {
      return reply.type('text/markdown').send(renderDossierMarkdown(dossier))
    }
    return dossier
  })
}
