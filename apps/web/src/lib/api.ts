/** Thin typed client for the API application layer. */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

export interface GapDto {
  id: string
  dimension: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface ReadinessReportDto {
  country: string
  domain: string
  summary: string
  dimensions: Array<{ dimension: string; gaps: GapDto[] }>
}

export interface AssessmentDto {
  agentId: string
  role: string
  mandate: string
  findings: string[]
  citations: Array<{ filename: string; articleNumber?: string; headingPath?: string }>
  confidence: number
}

export const api = {
  ask: (body: {
    institutionId: string
    question: string
    country: string
    domain: string
    lens: string
  }) => request<AssessmentDto>('/v1/agents/ask', { method: 'POST', body: JSON.stringify(body) }),

  readiness: (body: { country: string; domain: string; globalCountry?: string }) =>
    request<ReadinessReportDto>('/v1/readiness/report', { method: 'POST', body: JSON.stringify(body) }),

  auditChain: () => request<{ valid: boolean; brokenAt?: string }>('/v1/audit/chain'),

  /** Opens the progressive scenario SSE stream. */
  releaseScenario(id: string, domain: string, country: string): EventSource {
    return new EventSource(`${API_URL}/v1/scenarios/${id}/release?domain=${domain}&country=${country}`)
  },
}
