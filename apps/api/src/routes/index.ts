/** HTTP surface: knowledge base, agents, scenarios, readiness, audit. */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { IngestionClient } from '@sps/kb'
import { institutionsForDomain } from '@sps/shared'
import type { Domain, WorkflowLens } from '@sps/shared'
import { createEngine, createScenario, agentsFor } from '../engine.js'
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
    const query = z.object({ domain: z.string().default('health'), country: z.string().default('cm') }).parse(request.query)

    const definition = {
      id: params.id,
      domain: (query.domain as Domain) ?? 'health',
      country: query.country,
      title: 'Health-data breach in a public hospital',
      lens: 'simulation' as const,
      agents: agentsFor(query.country, query.domain as Domain).map((a) => a.id),
      events: [
        { sequence: 1, releaseChunk: 0, title: 'Incident reported', payload: 'Anomalous access to the e-health platform is detected.', visibleTo: ['ministry_health', 'cyber_agency'] },
        { sequence: 2, releaseChunk: 1, title: 'Scope widens', payload: 'Patient records may have been exfiltrated to an external host.', visibleTo: ['ministry_health', 'data_protection_authority', 'cyber_agency'] },
        { sequence: 3, releaseChunk: 2, title: 'Regulatory pressure', payload: 'Media reports surface; a notification deadline may apply.', visibleTo: ['data_protection_authority', 'coordinator'] },
      ],
    }

    const scenario = createScenario(definition, 'simulation')
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    for await (const batch of scenario.release({ chunkDelayMs: 800 })) {
      reply.raw.write(`data: ${JSON.stringify(batch)}\n\n`)
    }
    reply.raw.write('event: done\ndata: {}\n\n')
    reply.raw.end()
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
}
