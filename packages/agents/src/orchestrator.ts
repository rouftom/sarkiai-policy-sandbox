/**
 * Policy orchestrator: runs one institutional agent for one question, grounded
 * in the country KB, with persisted chain-of-thought + audit trail.
 *
 * The multi-agent coordination protocol lives in `@sps/scenarios`; this module
 * is the single-agent unit it composes.
 */

import { generateText, type LanguageModel } from 'ai'
import type {
  AgentAssessment,
  Citation,
  Domain,
  InstitutionSpec,
  WorkflowLens,
} from '@sps/shared'
import type { PolicyRetriever } from '@sps/retrieval'
import { citationFromChunk, hasGroundedCitation } from '@sps/citations'
import type { AuditService } from '@sps/audit'
import { buildSystemPrompt, citationDirective } from './prompt.js'

export interface AgentRunInput {
  institution: InstitutionSpec
  question: string
  country: string
  jurisdiction?: 'national' | 'regional' | 'international'
  domain: Domain
  lens: WorkflowLens
  runId?: string
  topK?: number
}

export interface OrchestratorDeps {
  model: LanguageModel
  retriever: PolicyRetriever
  audit?: AuditService
}

export class PolicyOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async runAgent(input: AgentRunInput): Promise<AgentAssessment> {
    const { institution, question, country, domain, lens } = input
    const runId = input.runId ?? `run-${Date.now()}`

    // 1. Retrieve country provisions (Y.3172 data-processing → model layer).
    const chunks = await this.deps.retriever.search({
      text: question,
      country,
      jurisdiction: input.jurisdiction,
      topK: input.topK ?? 8,
    })
    const citations: Citation[] = chunks.map((chunk) => citationFromChunk(chunk))

    // 2. Trap the reasoning: pre-decision trace.
    await this.deps.audit?.traceStep({
      runId,
      agentId: institution.id,
      step: 0,
      thought: `Retrieved ${chunks.length} provisions for "${question}" in ${country}.`,
      toolCalls: [{ name: 'retrieve', input: { question, country }, output: citations.map((c) => c.filename) }],
      model: 'n/a',
    })

    // 3. Generate the grounded answer.
    const system = `${buildSystemPrompt({ institution, country, domain, chunks })}\n\n${citationDirective()}`
    const { text, reasoning } = await generateText({
      model: this.deps.model,
      system,
      prompt: question,
    })

    const grounded = hasGroundedCitation(text, citations)

    // 4. Persist chain-of-thought + audit.
    await this.deps.audit?.traceStep({
      runId,
      agentId: institution.id,
      step: 1,
      thought: reasoning ?? text,
      toolCalls: [{ name: 'generate', input: { question }, output: { grounded } }],
      model: 'configured',
    })
    await this.deps.audit?.logAction({
      actor: institution.id,
      action: 'agent.assessment',
      target: domain,
      lens,
      citations,
      runId,
    })

    return {
      agentId: institution.id,
      role: institution.role,
      mandate: institution.mandate,
      domain,
      findings: [text],
      citations,
      gaps: [],
      confidence: grounded ? 0.85 : 0.4,
      cotTraceId: `${runId}:${institution.id}`,
    }
  }
}
