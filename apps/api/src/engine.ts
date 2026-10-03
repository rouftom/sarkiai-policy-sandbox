/** Composes the shared packages into the two lenses + the hybrid profile. */

import { createModel } from '@sps/agents'
import { PolicyOrchestrator } from '@sps/agents'
import { MultiAgentCoordinator } from '@sps/agents'
import { PolicyRetriever } from '@sps/retrieval'
import { ReadinessEngine } from '@sps/readiness'
import { AuditService } from '@sps/audit'
import { ScenarioEngine, type ScenarioDefinition } from '@sps/scenarios'
import { getWorkflowProfile, institutionsForDomain, type Domain, type WorkflowLens } from '@sps/shared'
import { config } from './config.js'

export function createEngine() {
  const model = createModel({
    provider: config.llm.provider,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
  })

  const retriever = new PolicyRetriever({
    qdrantUrl: config.qdrant.url,
    qdrantApiKey: config.qdrant.apiKey || undefined,
    collectionName: config.qdrant.collection,
    voyageApiKey: config.voyage.apiKey,
  })

  const audit = new AuditService({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
  const orchestrator = new PolicyOrchestrator({ model, retriever, audit })
  const coordinator = new MultiAgentCoordinator({ model, orchestrator, audit })
  const readiness = new ReadinessEngine({ model, retriever })

  return { model, retriever, audit, orchestrator, coordinator, readiness }
}

export function createScenario(definition: ScenarioDefinition, lens: WorkflowLens) {
  const profile = getWorkflowProfile(lens)
  if (!profile.stages.scenario) {
    throw new Error(`Lens "${lens}" does not run scenarios.`)
  }
  return new ScenarioEngine(definition)
}

export function agentsFor(country: string, domain: Domain) {
  return institutionsForDomain(domain).map((institution) => ({ ...institution, country }))
}
