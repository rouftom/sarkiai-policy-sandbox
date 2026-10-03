/**
 * ITU AI Readiness gap engine.
 *
 * For each of the 13 readiness dimensions (Report 2.0, 6 factors), compare the country provisions to
 * a global best-practice corpus and surface concrete gaps (unclear
 * responsibilities, missing standards, legislative gaps, coordination problems,
 * conflicts between objectives). This engine is shared by every lens.
 */

import { generateObject, type LanguageModel } from 'ai'
import { z } from 'zod'
import {
  READINESS_DIMENSION_IDS,
  READINESS_DIMENSIONS,
  type Domain,
  type Gap,
  type ReadinessDimension,
} from '@sps/shared'

function dimensionLabel(dimension: ReadinessDimension): string {
  return READINESS_DIMENSIONS.find((d) => d.shortName === dimension)?.name ?? dimension
}
import type { PolicyRetriever } from '@sps/retrieval'
import { citationFromChunk } from '@sps/citations'
import type { KbChunk } from '@sps/shared'

export interface ReadinessInput {
  country: string
  domain: Domain
  dimensions?: ReadinessDimension[]
  /** ISO alpha-2 of the best-practice corpus, or 'global'. */
  globalCountry?: string
  perDimensionK?: number
}

export interface ReadinessReport {
  country: string
  domain: Domain
  generatedAt: string
  dimensions: Array<{
    dimension: ReadinessDimension
    gaps: Gap[]
    countryChunks: KbChunk[]
    globalChunks: KbChunk[]
  }>
  summary: string
}

const gapSchema = z.object({
  gaps: z
    .array(
      z.object({
        description: z.string(),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        globalBestPractice: z.string().optional(),
      }),
    )
    .default([]),
  summary: z.string().default(''),
})

export class ReadinessEngine {
  constructor(
    private readonly deps: { model: LanguageModel; retriever: PolicyRetriever },
  ) {}

  async assess(input: ReadinessInput): Promise<ReadinessReport> {
    const dimensions = input.dimensions ?? READINESS_DIMENSION_IDS
    const globalCountry = input.globalCountry ?? 'global'
    const perDimensionK = input.perDimensionK ?? 5

    const results: ReadinessReport['dimensions'] = []

    for (const dimension of dimensions) {
      const query = dimensionLabel(dimension)
      const [countryChunks, globalChunks] = await Promise.all([
        this.deps.retriever.search({ text: query, country: input.country, topK: perDimensionK }),
        this.deps.retriever.search({ text: query, country: globalCountry, topK: perDimensionK }),
      ])

      const { object } = await generateObject({
        model: this.deps.model,
        schema: gapSchema,
        system: `You assess country "${input.country}" AI readiness on the ITU dimension "${dimension}", domain "${input.domain}".
Compare the COUNTRY provisions to the GLOBAL best-practice corpus. Identify concrete gaps: unclear responsibilities, missing standards, legislative gaps, coordination problems, or conflicting objectives.
Ground every claim in the provided passages. Do not analyse geographies or make country-specific policy recommendations — focus on domain-specific gaps and relevant global examples.`,
        prompt: `COUNTRY PROVISIONS:\n${countryChunks.map((c) => c.text).join('\n---\n') || '(none)'}\n\nGLOBAL BEST PRACTICE:\n${globalChunks.map((c) => c.text).join('\n---\n') || '(none)'}`,
      })

      const gaps: Gap[] = object.gaps.map((gap, i) => ({
        id: `${dimension}-${i}`,
        domain: input.domain,
        dimension,
        description: gap.description,
        severity: gap.severity,
        countryRef: countryChunks[0] ? citationFromChunk(countryChunks[0]) : undefined,
        globalBestPractice: gap.globalBestPractice,
        globalRef: globalChunks[0] ? citationFromChunk(globalChunks[0]) : undefined,
      }))

      results.push({ dimension, gaps, countryChunks, globalChunks })
    }

    const total = results.reduce((sum, r) => sum + r.gaps.length, 0)
    return {
      country: input.country,
      domain: input.domain,
      generatedAt: new Date().toISOString(),
      dimensions: results,
      summary: `Assessed ${dimensions.length} readiness dimensions for ${input.country.toUpperCase()}; found ${total} gaps.`,
    }
  }
}

export function renderReadinessMarkdown(report: ReadinessReport): string {
  const lines = [
    `# AI Readiness Assessment — ${report.country.toUpperCase()} (${report.domain})`,
    '',
    `_Generated ${report.generatedAt}_`,
    '',
    report.summary,
    '',
  ]
  for (const dimension of report.dimensions) {
    lines.push(`## ${dimension.dimension}`, '')
    if (dimension.gaps.length === 0) lines.push('_No gap identified._', '')
    for (const gap of dimension.gaps) {
      lines.push(`- **[${gap.severity}]** ${gap.description}`)
      if (gap.globalBestPractice) lines.push(`  - Global best practice: ${gap.globalBestPractice}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
