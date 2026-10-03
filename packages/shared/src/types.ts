/**
 * Core domain types shared by the whole engine.
 *
 * Everything is jurisdiction-aware: a knowledge-base chunk, a citation, a gap
 * and an agent assessment all carry the (country, jurisdiction, docType) tuple
 * so cross-national retrieval stays unambiguous.
 */

export type Domain =
  | 'health'
  | 'education'
  | 'telecom'
  | 'public_services'
  | 'agriculture'

export type Jurisdiction = 'national' | 'regional' | 'international'

export type DocType =
  | 'law'
  | 'strategy'
  | 'regulation'
  | 'policy'
  | 'treaty'
  | 'standard'
  | 'guidance'
  | 'report'

/** A workflow lens is a profile, never a duplicated code path. */
export type WorkflowLens = 'simulation' | 'readiness' | 'hybrid'

export type AgentRole =
  | 'legal_advisor'
  | 'institutional'
  | 'coordinator'
  | 'innovator'

/** The eight ITU AI Readiness dimensions surfaced by the assessment. */
export type ReadinessDimension =
  | 'open_data_open_source'
  | 'generative_ai_ecosystem'
  | 'contextualization_regional'
  | 'domain_integration_cross_domain'
  | 'human_interaction_supervision'
  | 'policy_implementation_opportunity'
  | 'ai_for_social_inclusion'
  | 'digital_infrastructure_energy'

export const READINESS_DIMENSIONS: ReadinessDimension[] = [
  'open_data_open_source',
  'generative_ai_ecosystem',
  'contextualization_regional',
  'domain_integration_cross_domain',
  'human_interaction_supervision',
  'policy_implementation_opportunity',
  'ai_for_social_inclusion',
  'digital_infrastructure_energy',
]

export interface Taxonomy {
  country: string // ISO-3166 alpha-2, or 'global'
  jurisdiction: Jurisdiction
  docType: DocType
  pillar?: ReadinessDimension[]
  namespace?: string
  version?: string
}

export interface KbChunk extends Taxonomy {
  id: string
  filename: string
  text: string
  chunkIndex: number
  headingPath?: string
  articleNumber?: string
  unitType?: string
  chunkRole?: 'parent' | 'child'
  sourceUrl?: string
  score?: number
  isActive: boolean
}

export interface Citation {
  country: string
  docType: DocType
  filename: string
  articleNumber?: string
  headingPath?: string
  sourceUrl?: string
  quote: string
}

export interface Gap {
  id: string
  domain: Domain
  dimension: ReadinessDimension
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  countryRef?: Citation
  globalBestPractice?: string
  globalRef?: Citation
}

export interface AgentAssessment {
  agentId: string
  role: AgentRole
  mandate: string
  domain: Domain
  findings: string[]
  citations: Citation[]
  gaps: Gap[]
  confidence: number
  cotTraceId: string
}

/** A scenario event is released progressively, never all at once. */
export interface ScenarioEvent {
  id: string
  runId: string
  sequence: number
  /** Which chunk index this event belongs to (progressive release). */
  releaseChunk: number
  title: string
  payload: string
  /** Agent ids allowed to see this event (information asymmetry). */
  visibleTo: string[]
  createdAt: string
}

export interface ScenarioRun {
  id: string
  domain: Domain
  country: string
  title: string
  lens: WorkflowLens
  agents: string[]
  events: ScenarioEvent[]
  status: 'draft' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
}

export interface AuditRecord {
  id: string
  runId?: string
  ts: string
  actor: string
  action: string
  target?: string
  lens: WorkflowLens
  citations: Citation[]
  hash: string
  prevHash?: string
}

export interface CoTTrace {
  id: string
  runId: string
  agentId: string
  step: number
  thought: string
  toolCalls: Array<{ name: string; input: unknown; output?: unknown }>
  model: string
  ts: string
}

export interface RetrievalQuery {
  text: string
  country: string
  jurisdiction?: Jurisdiction
  docType?: DocType
  namespace?: string
  topK?: number
}
