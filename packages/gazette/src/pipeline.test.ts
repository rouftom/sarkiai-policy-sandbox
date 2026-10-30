import { describe, expect, test } from 'bun:test'
import { PNG } from 'pngjs'
import type { InkMask } from './layout.js'
import { analyzeGazettePage, toKbChunks } from './pipeline.js'
import { cleanOcrText, extractArticleNumber, looksLikeHeading } from './ocr.js'

function pagePng(mask: InkMask): Uint8Array {
  const png = new PNG({ width: mask.width, height: mask.height })
  for (let i = 0; i < mask.data.length; i += 1) {
    const value = mask.data[i] ? 24 : 250
    const p = i * 4
    png.data[p] = value
    png.data[p + 1] = value
    png.data[p + 2] = value
    png.data[p + 3] = 255
  }
  return new Uint8Array(PNG.sync.write(png))
}

function gazetteMask(): InkMask {
  const width = 1000
  const height = 1400
  const mask: InkMask = { width, height, data: new Uint8Array(width * height) }
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) mask.data[row * width + col] = 1
    }
  }
  fill(180, 40, 640, 40)
  fill(60, 200, 400, 56)
  fill(60, 300, 400, 76)
  fill(540, 200, 400, 72)
  fill(540, 320, 400, 72)
  return mask
}

const localProvider = {
  mode: 'local' as const,
  servedBy: 'Ollama',
  residency: 'on-premise' as const,
  openWeights: true,
  models: { reasoning: 'qwen3.5:9b', vision: 'qwen3.5:9b', embedding: 'bge-m3' },
}

describe('local OCR helpers', () => {
  test('normalises line endings and strips trailing whitespace', () => {
    expect(cleanOcrText('  ARTICLE 2  \r\nLe texte   \r\n\r\n\r\nSuite ')).toEqual({
      text: 'ARTICLE 2\nLe texte\n\nSuite',
      blank: false,
    })
    expect(cleanOcrText('   \n\n ')).toEqual({ text: '', blank: true })
  })

  test('article numbers survive the forms a gazette prints', () => {
    expect(extractArticleNumber('ARTICLE 12 · Le traitement…')).toBe('ARTICLE 12')
    expect(extractArticleNumber('Article 1er · Le présent décret…')).toBe('ARTICLE 1er')
    expect(extractArticleNumber('Art. 9')).toBe('ARTICLE 9')
    expect(extractArticleNumber('article 12 bis')).toBe('ARTICLE 12 bis')
    expect(extractArticleNumber('no article here')).toBeUndefined()
  })

  test('recognises a decree heading', () => {
    expect(looksLikeHeading('DÉCRET N° 2026/341 DU 08 OCTOBRE 2026')).toBe(true)
    expect(looksLikeHeading('Le responsable du traitement notifie…')).toBe(false)
  })
})

describe('gazette pipeline · with injected OCR', () => {
  test('transcribes every zone and keeps provenance', async () => {
    const page = await analyzeGazettePage({
      bytes: pagePng(gazetteMask()),
      filename: 'jo_2026_special.pdf',
      page: 3,
      sourceUrl: 'https://example.gov.cm/jo/2026-special.pdf',
      modelLabel: 'tesseract',
      provider: localProvider,
      deps: {
        transcribe: async (input) => {
          if (input.kind === 'text' && input.bbox.width > 600) {
            return {
              text: 'DÉCRET N° 2026/341 DU 08 OCTOBRE 2026',
              durationMs: 5,
              finishReason: 'stop',
              blank: false,
            }
          }
          return {
            text: 'ARTICLE 2 · Le responsable du traitement notifie toute violation dans un délai de soixante-douze heures.',
            durationMs: 5,
            finishReason: 'stop',
            blank: false,
          }
        },
      },
    })

    expect(page.image.width).toBe(1000)
    expect(page.regions.length).toBeGreaterThanOrEqual(5)
    expect(page.artifacts).toEqual([])
    expect(page.usage.costUsd).toBe(0)
    expect(page.usage.segmentationCalls).toBe(0)
    expect(page.usage.transcriptionCalls).toBe(page.regions.length)

    const article = page.regions.find((region) => region.articleNumber)
    expect(article?.articleNumber).toBe('ARTICLE 2')
    expect(article?.provenance.page).toBe(3)
    expect(article?.provenance.href).toBe('https://example.gov.cm/jo/2026-special.pdf#page=3')
    expect(article?.provenance.bbox).toEqual(article!.bbox)

    const chunks = toKbChunks(page, {
      country: 'cm',
      jurisdiction: 'national',
      docType: 'regulation',
      namespace: 'gazette',
    })
    expect(chunks.length).toBe(page.regions.length)
    expect(chunks[0]?.metadata.provenance.documentId).toBe(page.documentId)
    expect(chunks.every((chunk) => chunk.sourceUrl?.includes('#page=3'))).toBe(true)
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index))
  })

  test('a failed zone is reported, not silently dropped', async () => {
    const page = await analyzeGazettePage({
      bytes: pagePng(gazetteMask()),
      filename: 'jo.pdf',
      modelLabel: 'tesseract',
      provider: localProvider,
      deps: {
        transcribe: async () => {
          throw new Error('ocr timeout')
        },
      },
    })

    expect(page.regions.every((region) => region.blank)).toBe(true)
    expect(page.warnings.some((warning) => warning.includes('ocr timeout'))).toBe(true)
    expect(page.warnings.some((warning) => warning.includes('Transcription failed'))).toBe(true)
    expect(toKbChunks(page, { country: 'cm', jurisdiction: 'national', docType: 'regulation' })).toEqual([])
  })

  test('refuses to run without an OCR backend', async () => {
    await expect(
      analyzeGazettePage({
        bytes: pagePng(gazetteMask()),
        filename: 'jo.pdf',
        modelLabel: 'tesseract',
        provider: localProvider,
      }),
    ).rejects.toThrow(/OCR client/)
  })
})
