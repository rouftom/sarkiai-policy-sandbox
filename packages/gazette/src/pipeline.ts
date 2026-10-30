/**
 * Scanned-gazette ingestion pipeline.
 *
 *   page image → grayscale → ink mask → XY-cut layout
 *      └─ text zones → on-premise Tesseract OCR, one crop per zone
 *   → regions with page/column/bbox provenance → KB chunks
 *
 * Every step is observable: the console draws the same boxes the pipeline used,
 * so a human can reject a bad cut before the text reaches the knowledge base.
 * Geometry is deterministic and OCR runs locally; nothing leaves the machine.
 */

import { createHash } from 'node:crypto'
import type { DocType, Jurisdiction, KbChunk, ProviderDescriptor, Taxonomy } from '@sps/shared'
import { decodeGray, detectMime } from './image.js'
import { columnOf, inkMask, otsuThreshold, pageLayout, type BBox } from './layout.js'
import {
  extractArticleNumber,
  looksLikeHeading,
  type OcrResult,
  type OcrZoneInput,
  type ZoneKind,
} from './ocr.js'

export interface GazetteProvenance {
  documentId: string
  filename: string
  page: number
  regionId: string
  column: number
  columns: number
  bbox: BBox
  pageWidth: number
  pageHeight: number
  imageSha256: string
  /** Original public source, when the caller has one. */
  sourceUrl?: string
  /** Deep link that opens the page at the right place (PDF fragment or console). */
  href: string
  /** How the geometry was obtained. */
  geometry: 'projection-profile'
  /** Engine that produced the text. */
  transcriptionModel: string
}

export interface GazetteRegion {
  id: string
  kind: ZoneKind
  column: number
  bbox: BBox
  text: string
  articleNumber?: string
  heading: boolean
  characters: number
  blank: boolean
  finishReason?: string
  durationMs: number
  /** True when the zone is an artefact (a stamp, a signature), not prose. */
  skipped?: boolean
  /** Visual artefacts overlapping this region. Always empty locally (no SAM). */
  artifacts: string[]
  provenance: GazetteProvenance
  error?: string
}

export interface GazetteArtifact {
  id: string
  label: 'stamp' | 'signature' | 'table'
  bbox: BBox
  confidence?: number
  source: 'local-ocr'
}

export interface GazetteUsage {
  inputTokens: number
  outputTokens: number
  transcriptionCalls: number
  segmentationCalls: number
  costUsd: number
}

export interface GazettePage {
  documentId: string
  filename: string
  page: number
  image: { width: number; height: number; mime: string; sha256: string }
  layout: { threshold: number; inkRatio: number; columns: BBox[]; regions: BBox[] }
  regions: GazetteRegion[]
  artifacts: GazetteArtifact[]
  usage: GazetteUsage
  warnings: string[]
  model: string
  provider: Pick<ProviderDescriptor, 'mode' | 'servedBy' | 'residency' | 'openWeights' | 'models'>
  startedAt: string
  durationMs: number
}

export interface GazetteDeps {
  /** Inject a fake in tests; defaults to the OCR client. */
  transcribe?: (input: OcrZoneInput) => Promise<OcrResult>
}

export interface AnalyzeGazetteInput {
  bytes: Uint8Array
  mime?: string
  filename: string
  page?: number
  documentId?: string
  sourceUrl?: string
  /** Engine label written into every provenance record, e.g. `tesseract`. */
  modelLabel: string
  provider: GazettePage['provider']
  /** Local OCR client; required unless `deps.transcribe` is injected. */
  ocr?: { transcribe(input: OcrZoneInput): Promise<OcrResult> }
  maxZones?: number
  concurrency?: number
  signal?: AbortSignal
  deps?: GazetteDeps
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await fn(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

function shortHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Crop geometry is page-absolute; a merged leaf keeps the union box. */
export function regionId(page: number, column: number, index: number): string {
  return `p${page}-c${column}-z${index}`
}

export async function analyzeGazettePage(input: AnalyzeGazetteInput): Promise<GazettePage> {
  const started = Date.now()
  const page = input.page ?? 1
  const mime = detectMime(input.bytes, input.mime)
  const image = decodeGray(input.bytes, mime)
  const threshold = otsuThreshold(image.data)
  const mask = inkMask(image, threshold)
  const layout = pageLayout(mask, { threshold, maxZones: input.maxZones ?? 24 })

  const sha256 = shortHash(input.bytes)
  const documentId = input.documentId ?? sha256.slice(0, 16)
  const warnings: string[] = []

  if (layout.regions.length === 0) {
    warnings.push('No ink was found on the page. Check the scan or the threshold.')
  }
  if (layout.regions.length >= (input.maxZones ?? 24)) {
    warnings.push(
      `Zone budget reached (${input.maxZones ?? 24}); close neighbours were merged. Raise maxZones for dense pages.`,
    )
  }

  const transcribe = input.deps?.transcribe ?? (input.ocr ? input.ocr.transcribe.bind(input.ocr) : undefined)
  if (!transcribe) throw new Error('analyzeGazettePage needs an OCR client or an injected transcriber.')

  const zones = layout.regions.map((box, index) => ({
    box,
    index,
    column: columnOf(box, layout.columns),
    kind: 'text' as ZoneKind,
  }))

  const results = await mapLimit(zones, input.concurrency ?? 4, async (zone) => {
    const id = regionId(page, zone.column, zone.index + 1)
    try {
      return await transcribe({
        image,
        bbox: zone.box,
        kind: zone.kind,
        page,
        column: zone.column,
        columns: Math.max(1, layout.columns.length),
        filename: input.filename,
        signal: input.signal,
      })
    } catch (error) {
      return {
        text: '',
        durationMs: 0,
        finishReason: 'error' as const,
        blank: true,
        error: `${id}: ${(error as Error).message}`,
      } satisfies OcrResult & { error: string }
    }
  })

  const regions: GazetteRegion[] = zones.map((zone, index) => {
    const result = results[index]!
    const id = regionId(page, zone.column, zone.index + 1)
    const error = 'error' in result ? (result as OcrResult & { error: string }).error : undefined
    if (error) warnings.push(`Transcription failed for ${id}: ${error.slice(0, 180)}`)
    else if (result.blank) warnings.push(`No readable text in ${id}.`)

    const sourceUrl = input.sourceUrl
    const articleNumber = extractArticleNumber(result.text)
    return {
      id,
      kind: zone.kind,
      column: zone.column,
      bbox: zone.box,
      text: result.text,
      ...(articleNumber ? { articleNumber } : {}),
      heading: looksLikeHeading(result.text),
      characters: result.text.length,
      blank: result.blank,
      finishReason: result.finishReason,
      durationMs: result.durationMs,
      artifacts: [],
      provenance: {
        documentId,
        filename: input.filename,
        page,
        regionId: id,
        column: zone.column,
        columns: Math.max(1, layout.columns.length),
        bbox: zone.box,
        pageWidth: image.width,
        pageHeight: image.height,
        imageSha256: sha256,
        ...(sourceUrl ? { sourceUrl } : {}),
        href: sourceUrl
          ? `${sourceUrl.split('#')[0]}#page=${page}`
          : `gazette://${documentId}/page/${page}/${id}`,
        geometry: 'projection-profile',
        transcriptionModel: input.modelLabel,
      },
      ...(error ? { error } : {}),
    }
  })

  return {
    documentId,
    filename: input.filename,
    page,
    image: { width: image.width, height: image.height, mime, sha256 },
    layout: {
      threshold,
      inkRatio: layout.inkRatio,
      columns: layout.columns,
      regions: layout.regions,
    },
    regions,
    artifacts: [],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      transcriptionCalls: regions.filter((region) => !region.blank).length,
      segmentationCalls: 0,
      costUsd: 0,
    },
    warnings,
    model: input.modelLabel,
    provider: input.provider,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
  }
}

export interface GazetteChunk extends KbChunk {
  metadata: {
    provenance: GazetteProvenance
    kind: ZoneKind
    artifacts: string[]
  }
}

export interface GazetteTaxonomy extends Taxonomy {
  namespace?: string
}

/** Ready-to-ingest chunks: one per transcribed zone, provenance intact. */
export function toKbChunks(page: GazettePage, taxonomy: GazetteTaxonomy): GazetteChunk[] {
  return page.regions
    .filter((region) => !region.blank && region.text.trim().length > 0)
    .map((region, index) => ({
      id: `${page.documentId}:${region.id}`,
      chunkIndex: index,
      filename: page.filename,
      text: region.text.trim(),
      headingPath: region.heading
        ? `PAGE ${page.page} > COLUMN ${region.column}`
        : `PAGE ${page.page} > COLUMN ${region.column} > ${region.articleNumber ?? region.id}`,
      ...(region.articleNumber ? { articleNumber: region.articleNumber } : {}),
      unitType: 'gazette_zone',
      sourceUrl: region.provenance.href,
      country: taxonomy.country,
      jurisdiction: taxonomy.jurisdiction as Jurisdiction,
      docType: taxonomy.docType as DocType,
      ...(taxonomy.pillar ? { pillar: taxonomy.pillar } : {}),
      ...(taxonomy.namespace ? { namespace: taxonomy.namespace } : {}),
      ...(taxonomy.version ? { version: taxonomy.version } : {}),
      isActive: true,
      metadata: {
        provenance: region.provenance,
        kind: region.kind,
        artifacts: region.artifacts,
      },
    }))
}
