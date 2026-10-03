/** HTTP surface: knowledge base, agents, scenarios, readiness, audit. */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { IngestionClient } from '@sps/kb'
import { buildRunDossier, renderDossierMarkdown } from '@sps/report'
import { institutionsForDomain } from '@sps/shared'
import type { Domain, JointSituationReport, WorkflowLens } from '@sps/shared'
import { createEngine, createScenario } from '../engine.js'
import { healthDataBreach } from '../scenarios.js'
import { config } from '../config.js'

const engine = createEngine()
const ingestion = new IngestionClient({ baseUrl: config.ingestion.baseUrl, apiKey: config.ingestion.apiKey })

const lensSchema = z.enum(['simulation', 'readiness', 'hybrid'])

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', service: 'sps-api' }))

  // ── Knowledge base ────────────────────────────────────────────────────────
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

    const result = await ingestion.ingestText(body.data)
    return result
  })

  // ── Single mandated agent ─────────────────────────────────────────────────
  app.post('/v1/agents/ask', async (request, reply) => {
    const body = z
      .object({
        institutionId: z.string(),
        question: z.string().min(1),
        country: z.string().length(2),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
        lens: lensSchema.default('hybrid'),
        runId: z.string().optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const institution = institutionsForDomain(body.data.domain as Domain).find((i) => i.id === body.data.institutionId)
    if (!institution) return reply.status(404).send({ error: `Unknown institution "${body.data.institutionId}"` })

    return engine.orchestrator.runAgent({
      institution,
      question: body.data.question,
      country: body.data.country,
      domain: body.data.domain as Domain,
      lens: body.data.lens as WorkflowLens,
      runId: body.data.runId,
    })
  })

  // ── Scenario: progressive event release (SSE) ─────────────────────────────
  app.get('/v1/scenarios/:id/release', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params)
    const query = z.object({ country: z.string().default('cm') }).parse(request.query)

    const scenario = createScenario(healthDataBreach(query.country), 'simulation')
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    for await (const batch of scenario.release({ chunkDelayMs: 800 })) {
      reply.raw.write(`data: ${JSON.stringify(batch)}\n\n`)
    }
    reply.raw.write('event: done\ndata: {}\n\n')
    reply.raw.end()
  })

  // ── Scenario: run all ticks + multi-agent reconciliation ──────────────────
  app.post('/v1/scenarios/run', async (request, reply) => {
    const body = z
      .object({
        id: z.string().default('health-data-breach'),
        country: z.string().length(2).default('cm'),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']).default('health'),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { country, domain } = body.data
    const scenario = createScenario(healthDataBreach(country), 'simulation')
    const run = scenario.toRun()
    const institutions = institutionsForDomain(domain as Domain)
    const ticks = [...new Set(run.events.map((e) => e.releaseChunk))].sort((a, b) => a - b)

    const history: typeof run.events = []
    const reports: JointSituationReport[] = []
    for (const tick of ticks) {
      const events = run.events.filter((e) => e.releaseChunk === tick)
      history.push(...events)
      const assessments = await engine.coordinator.runTick({
        runId: run.id,
        tick,
        country,
        domain: domain as Domain,
        lens: 'simulation',
        institutions,
        events,
        history: [...history],
      })
      const report = await engine.coordinator.reconcile({
        runId: run.id,
        tick,
        country,
        domain: domain as Domain,
        assessments,
      })
      reports.push(report)
    }

    await engine.reports.saveReports(run.id, reports)
    const dossier = buildRunDossier({
      runId: run.id,
      audit: await engine.audit.getAuditForRun(run.id),
      traces: await engine.audit.getTrace(run.id),
      reports,
      integrity: { valid: true },
    })

    return { runId: run.id, country, domain, ticks: reports, dossier }
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

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get('/v1/audit/chain', async () => engine.audit.verifyChain())
  app.get('/v1/audit/trace/:runId', async (request) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    return { runId, trace: await engine.audit.getTrace(runId) }
  })

  // ── Run dossier (audit + CoT + reports + citations) ───────────────────────
  app.get('/v1/audit/dossier/:runId', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const format = z.object({ format: z.enum(['json', 'markdown']).default('json') }).parse(request.query)

    const dossier = buildRunDossier({
      runId,
      audit: await engine.audit.getAuditForRun(runId),
      traces: await engine.audit.getTrace(runId),
      reports: await engine.reports.getReports(runId),
      integrity: await engine.audit.verifyChain(),
    })

    if (format.format === 'markdown') {
      return reply.type('text/markdown').send(renderDossierMarkdown(dossier))
    }
    return dossier
  })
}
