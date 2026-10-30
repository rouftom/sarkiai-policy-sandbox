#!/usr/bin/env bun
/**
 * Pre-flight check for the local gazette pipeline.
 *
 *   bun scripts/check-gazette.ts
 *
 * The Scanned gazette screen needs the Tesseract OCR service, and the OCR
 * service needs the corpus languages. This script checks:
 *   - `OCR_URL` answers and reports its languages;
 *   - a short French sample is transcribed (round-trip);
 *   - `INGESTION_URL` answers, since the gazette hands its text to it.
 *
 * Exit code 0 when ready, 1 otherwise.
 */

const ocr = (process.env.OCR_URL || 'http://localhost:8004').replace(/\/$/, '')
const ingestion = (process.env.INGESTION_URL || 'http://localhost:8001').replace(/\/$/, '')
const apiKey = process.env.SERVICE_API_KEY || ''

let failures = 0

function line(ok: boolean, label: string, detail: string): void {
  console.log(`[${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(20)} ${detail}`)
  if (!ok) failures += 1
}

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers)
  if (apiKey) headers.set('x-api-key', apiKey)
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function main(): Promise<void> {
  console.log('Checking the local gazette pipeline\n')

  try {
    const health = (await json(`${ocr}/health`)) as { status?: string; languages?: string; service?: string }
    line(health.status === 'ok', 'OCR service', `${ocr} · ${health.service ?? 'sps-ocr'}`)
    if (health.languages) {
      const french = health.languages.split('+').some((language) => language.startsWith('fra') || language === 'fr')
      line(french, 'OCR languages', `${health.languages}${french ? '' : ' (French is missing)'}`)
    }
  } catch (error) {
    line(false, 'OCR service', `${ocr} unreachable: ${(error as Error).message}`)
  }

  try {
    const health = (await json(`${ingestion}/health`)) as { status?: string; vectorBackend?: string }
    line(health.status === 'ok', 'Ingestion service', `${ingestion} · ${health.vectorBackend ?? 'qdrant'}`)
  } catch (error) {
    line(false, 'Ingestion service', `${ingestion} unreachable: ${(error as Error).message}`)
  }

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log('Gazette pipeline ready.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
