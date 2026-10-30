/**
 * Local OCR for one layout zone.
 *
 * The unit is one crop, not one page: a column cut, a paragraph, a table. The
 * deterministic layout (`./layout.ts`) decides the boxes and this module sends
 * each crop to the on-premise Tesseract service (`services/ocr`), so a wrong cut
 * stays visible in the console instead of being averaged into a page-level blob.
 *
 * No model leaves the machine: the service runs Tesseract locally and returns
 * plain text. The helpers below are pure so they can be tested without a
 * container.
 */

import { cropToPng, type GrayImage } from './image.js'
import type { BBox } from './layout.js'

export type ZoneKind = 'text' | 'table'

export interface OcrZoneInput {
  image: GrayImage
  bbox: BBox
  kind: ZoneKind
  page: number
  column: number
  columns: number
  filename: string
  signal?: AbortSignal
}

export interface OcrResult {
  text: string
  durationMs: number
  finishReason: 'stop' | 'error' | 'skipped'
  /** True when the crop holds no readable text. */
  blank: boolean
}

export interface OcrOptions {
  /** e.g. http://ocr:8000 */
  baseUrl: string
  /** Shared service key, when the deployment sets one. */
  apiKey?: string
  /** Tesseract languages, e.g. `fra+eng`. */
  languages?: string
  fetchImpl?: typeof fetch
}

/**
 * Normalise what Tesseract returns.
 *
 * Scans carry hard line breaks mid-sentence; joining them would destroy the
 * paragraph structure the layout already recovered, so only trailing spaces,
 * CRLF and runs of blank lines are normalised. The text is never rewritten:
 * citations are validated against these exact characters.
 */
export function cleanOcrText(raw: string): { text: string; blank: boolean } {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text, blank: text.length === 0 }
}

/**
 * Article number from an OCR'd zone, normalised for citations.
 * Handles the forms a bilingual gazette actually prints: ARTICLE 12,
 * ARTICLE 1er, ARTICLE 12 bis, Art. 9.
 */
export function extractArticleNumber(text: string): string | undefined {
  const match = text.match(/\b(?:ARTICLE|Art\.?)\s+(premier|1er|[0-9]{1,4}(?:\s*(?:bis|ter|quater))?)\b/i)
  if (!match?.[1]) return undefined
  return `ARTICLE ${match[1].replace(/\s+/g, ' ').trim()}`
}

/** True when the zone looks like a heading rather than an article body. */
export function looksLikeHeading(text: string): boolean {
  const first = text.split('\n')[0]?.trim() ?? ''
  if (!first || first.length > 140) return false
  return /^(D[EÉ]CRET|ARR[EÊ]T[EÉ]|LOI|ORDONNANCE|CIRCULAIRE|D[EÉ]CISION|R[EÈ]GLEMENT|JOURNAL OFFICIEL)\b/i.test(
    first,
  )
}

/** On-premise Tesseract OCR, one HTTP call per zone. */
export class OcrClient {
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly languages: string
  private readonly fetchImpl: typeof fetch

  constructor(options: OcrOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.languages = options.languages ?? 'fra+eng'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async transcribe(input: OcrZoneInput): Promise<OcrResult> {
    const started = Date.now()
    const png = cropToPng(input.image, input.bbox)
    const form = new FormData()
    form.append('file', new Blob([png as unknown as BlobPart], { type: 'image/png' }), `${input.filename}-p${input.page}.png`)

    const url = new URL(`${this.baseUrl}/v1/ocr/image`)
    url.searchParams.set('languages', this.languages)

    const headers: Record<string, string> = {}
    if (this.apiKey) headers['X-API-Key'] = this.apiKey

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: form,
      signal: input.signal,
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300)
      throw new Error(`Local OCR failed (${response.status}): ${detail}`)
    }

    const payload = (await response.json()) as { text?: string }
    const { text, blank } = cleanOcrText(payload.text ?? '')
    return { text, durationMs: Date.now() - started, finishReason: 'stop', blank }
  }
}
