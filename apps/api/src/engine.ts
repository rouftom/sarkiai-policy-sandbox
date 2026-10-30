/** Composes the shared packages into the lenses + the hybrid profile. */

import {
  createModel,
  listProviderModels,
  resolveProvider,
  PolicyOrchestrator,
  MultiAgentCoordinator,
} from '@sps/agents'
import { PolicyRetriever, QdrantKnowledge, type Retriever } from '@sps/retrieval'
import { ReadinessEngine } from '@sps/readiness'
import { AuditService } from '@sps/audit'
import { ReportStore } from '@sps/report'
import { ObjectStore } from '@sps/storage'
import { ScenarioEngine, type ScenarioDefinition } from '@sps/scenarios'
import {
  getWorkflowProfile,
  institutionsForDomain,
  type Domain,
  type ProviderDescriptor,
  type WorkflowLens,
} from '@sps/shared'
import { config } from './config.js'

/**
 * Everything that talks to the chat model. Rebuilt when the operator picks a
 * different local model, so the agents, the coordinator and the readiness lens
 * always share one handle.
 */
function buildModelStack(
  provider: ProviderDescriptor,
  modelId: string,
  retriever: Retriever,
  audit: AuditService,
) {
  const active: ProviderDescriptor = modelId
    ? { ...provider, models: { ...provider.models, reasoning: modelId, vision: modelId } }
    : provider
  const model = createModel({ provider: active })
  const orchestrator = new PolicyOrchestrator({
    model,
    retriever,
    audit,
    provider: active,
    maxOutputTokens: Number(process.env.AGENT_MAX_OUTPUT_TOKENS ?? 4096) || 4096,
  })
  const coordinator = new MultiAgentCoordinator({ model, orchestrator, audit })
  const onModel = (id: string) => ({ ...active, models: { ...active.models, reasoning: id } })
  const readiness = new ReadinessEngine({
    model,
    retriever,
    modelFor: (id) => createModel({ provider: onModel(id) }),
  })
  return { provider: active, model, orchestrator, coordinator, readiness }
}

export function createEngine() {
  // One provider decision for the whole engine: the local Ollama server.
  const provider = resolveProvider(process.env)
  const retriever: Retriever = new PolicyRetriever({
    qdrantUrl: config.qdrant.url,
    qdrantApiKey: config.qdrant.apiKey || undefined,
    collectionName: config.qdrant.collection,
    embeddingsBaseUrl: config.embeddings.baseUrl,
    embeddingModel: config.embeddings.model,
    rerankUrl: config.rerank.url || undefined,
    rerankModel: config.rerank.model,
  })

  const audit = new AuditService({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
  const reports = new ReportStore({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
  const storage = new ObjectStore({
    endpoint: config.s3.endpoint,
    bucket: config.s3.bucket,
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey,
  })

  const engine = {
    retriever,
    retrievalBackend: 'qdrant' as const,
    audit,
    reports,
    storage,
    ...buildModelStack(provider, '', retriever, audit),
    /** The deployment only has one catalogue: the models pulled in Ollama. */
    catalogMode: 'local' as const,
    /** Point the engine at a model id of the local catalogue. Rebuilds the model stack. */
    useModel(modelId: string): ProviderDescriptor {
      Object.assign(engine, buildModelStack(provider, modelId, retriever, audit))
      return engine.provider
    },
    /** Chat-capable models this server has pulled. */
    async listModels() {
      return listProviderModels(provider)
    },
  }
  return engine
}

export type Engine = ReturnType<typeof createEngine>

/** Direct ingestion/status client for the Knowledge base screen (Qdrant + Mongo images). */
export function createKnowledgeIngestor(): QdrantKnowledge {
  return new QdrantKnowledge({
    qdrantUrl: config.qdrant.url,
    ...(config.qdrant.apiKey ? { qdrantApiKey: config.qdrant.apiKey } : {}),
    collection: config.qdrant.collection,
    denseVector: config.qdrant.denseVector,
    sparseVector: config.qdrant.sparseVector,
    sparseModel: config.qdrant.sparseModel,
    embeddingsBaseUrl: config.embeddings.baseUrl,
    embeddingModel: config.embeddings.model,
    rerankUrl: config.rerank.url || undefined,
    rerankModel: config.rerank.model,
    mongodbUri: config.mongodb.uri,
    dbName: config.mongodb.dbName,
    ingestionUrl: config.ingestion.baseUrl,
    ingestionApiKey: config.ingestion.apiKey,
  })
}

/**
 * Record the active backend once. It never changes on a sovereign install, so
 * the audit chain gets a single record at boot and none on the restarts after.
 */
export async function recordProviderSwitch(
  provider: ReturnType<typeof resolveProvider>,
  audit: AuditService,
): Promise<'recorded' | 'unchanged' | 'unavailable'> {
  try {
    const previous = await audit.lastAction('provider.started')
    if (previous?.target === `provider:${provider.mode}:${provider.models.reasoning}`) return 'unchanged'
    await audit.logAction({
      actor: 'system',
      action: 'provider.started',
      target: `provider:${provider.mode}:${provider.models.reasoning}`,
      lens: 'hybrid',
    })
    return 'recorded'
  } catch {
    return 'unavailable'
  }
}

export function createScenario(definition: ScenarioDefinition, lens: WorkflowLens) {
  const profile = getWorkflowProfile(lens)
  if (!profile.stages.scenario) {
    throw new Error(`Lens "${lens}" does not run scenarios.`)
  }
  return new ScenarioEngine(definition)
}

