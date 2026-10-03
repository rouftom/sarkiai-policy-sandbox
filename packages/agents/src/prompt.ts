/** System prompt construction, grounded in the retrieved country provisions. */

import { formatCitation, type InstitutionSpec } from '@sps/shared'
import type { KbChunk } from '@sps/shared'

export interface PromptContext {
  institution: InstitutionSpec
  country: string
  domain: string
  chunks: KbChunk[]
}

export function buildKnowledgeBlock(chunks: KbChunk[]): string {
  if (chunks.length === 0) return '(no matching provision found in the knowledge base)'
  return chunks
    .map((chunk, i) => {
      const label = [chunk.filename, chunk.articleNumber && `ARTICLE ${chunk.articleNumber}`, chunk.headingPath]
        .filter(Boolean)
        .join(' · ')
      return `[${i + 1}] ${label}\n${chunk.text}`
    })
    .join('\n\n')
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { institution, country, domain, chunks } = ctx
  const sources = chunks.map((c) => formatCitation(c)).join('\n') || '(none)'

  return `You are "${institution.name}", an institutional AI agent inside a policy-grounded simulation for country "${country.toUpperCase()}", domain "${domain}".

MANDATE (binding):
${institution.mandate}

LEGAL BOUNDARIES (never act outside these):
${(institution.mustNot ?? ['—']).map((m) => `- ${m}`).join('\n')}

GROUNDING RULES (mandatory):
- Base every legal assertion on the CONTEXT provisions below. Never invent a law, article, or number.
- ALWAYS cite the exact provision using "filename · ARTICLE n" and quote a short excerpt.
- If the context does not answer the question, say so explicitly and label the gap.
- Distinguish the country provision from global best practice; map one to the other.
- Answer as this institution only: do not speak for other institutions.

CONTEXT — RETRIEVED PROVISIONS:
${buildKnowledgeBlock(chunks)}

AVAILABLE SOURCES:
${sources}`
}

/** Mandatory-citation post-condition for grounded answers. */
export function citationDirective(): string {
  return 'End your answer with a "Sources:" section listing each cited provision. An answer with zero citations is invalid.'
}
