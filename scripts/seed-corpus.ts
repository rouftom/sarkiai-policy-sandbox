#!/usr/bin/env bun
/**
 * Seed the knowledge base from a country corpus manifest.
 *
 *   bun scripts/seed-corpus.ts                      # data/country/cm/manifest.json
 *   bun scripts/seed-corpus.ts --country cm
 *   bun scripts/seed-corpus.ts --api http://localhost:8001 --key "$SERVICE_API_KEY"
 *   bun scripts/seed-corpus.ts --dry-run            # list what would be sent
 *   bun scripts/seed-corpus.ts --including-missing  # also try files marked to_confirm
 *
 * The manifest is the source of truth: title, summary, docType, jurisdiction,
 * rights and pillar travel with each document into the Qdrant payload. A
 * scanned PDF falls back to the local OCR service inside the ingestion service.
 *
 * Only the local ingestion endpoint is contacted (`INGESTION_URL`); nothing
 * leaves the host.
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

interface ManifestDocument {
  id?: string
  title?: string
  docType?: string
  jurisdiction?: string
  pillar?: string[]
  status?: string
  file?: string
  sourceUrl?: string
  rights?: string
  rightsNote?: string
  summary?: string
  note?: string
  namespace?: string
  version?: string
}

interface Manifest {
  country?: string
  jurisdiction?: string
  documents?: ManifestDocument[]
}

function arg(name: string, fallback = ''): string {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return fallback
  return process.argv[index + 1] ?? fallback
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const api = (arg('api', process.env.INGESTION_URL || 'http://localhost:8001')).replace(/\/$/, '')
const apiKey = arg('key', process.env.SERVICE_API_KEY || '')
const country = arg('country', 'cm').toLowerCase()
const corpusDir = resolve(arg('dir', join('data', 'country', country)))
const manifestPath = resolve(arg('manifest', join(corpusDir, 'manifest.json')))
const dryRun = flag('dry-run')
const includeMissing = flag('including-missing')
const only = arg('only', '')

if (!existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
const jurisdiction = manifest.jurisdiction || 'national'

function value(input: string | undefined): string | undefined {
  const trimmed = input?.trim()
  return trimmed ? trimmed : undefined
}

async function ingest(document: ManifestDocument): Promise<'ingested' | 'skipped' | 'failed'> {
  const filename = document.file?.trim()
  if (!filename) return 'skipped'
  if (only && !(document.id ?? filename).includes(only)) return 'skipped'

  const path = join(corpusDir, filename)
  if (!existsSync(path)) {
    if (includeMissing || document.status === 'present') {
      console.warn(`  missing file: ${filename}`)
    }
    return 'skipped'
  }

  const form = new FormData()
  form.append('file', new Blob([readFileSync(path)], { type: extname(filename) === '.pdf' ? 'application/pdf' : 'text/plain' }), basename(filename))
  form.append('country', country)
  form.append('jurisdiction', document.jurisdiction || jurisdiction)
  form.append('docType', document.docType || 'policy')
  if (value(document.title)) form.append('title', document.title!.trim())
  if (value(document.summary)) form.append('summary', document.summary!.trim())
  if (value(document.rights)) form.append('rights', document.rights!.trim())
  if (value(document.rightsNote)) form.append('rightsNote', document.rightsNote!.trim())
  if (value(document.namespace)) form.append('namespace', document.namespace!.trim())
  if (value(document.version)) form.append('version', document.version!.trim())
  if (value(document.sourceUrl)) form.append('sourceUrl', document.sourceUrl!.trim())
  if (document.pillar?.length) form.append('pillar', document.pillar.join(','))

  if (dryRun) {
    console.log(`  would ingest ${filename} (${document.docType ?? 'policy'}, ${document.rights ?? 'rights unset'})`)
    return 'ingested'
  }

  const headers: Record<string, string> = {}
  if (apiKey) headers['x-api-key'] = apiKey

  try {
    const response = await fetch(`${api}/v1/ingest/file`, { method: 'POST', headers, body: form })
    const body = (await response.json().catch(() => ({}))) as { chunksInserted?: number; detail?: string }
    if (!response.ok) {
      console.error(`  ${filename}: ${response.status} ${body.detail ?? ''}`.trim())
      return 'failed'
    }
    console.log(`  ${filename}: ${body.chunksInserted ?? 0} chunk(s)`)
    return 'ingested'
  } catch (error) {
    console.error(`  ${filename}: ${(error as Error).message}`)
    return 'failed'
  }
}

async function main(): Promise<void> {
  const documents = manifest.documents ?? []
  const eligible = documents.filter((document) => {
    const status = document.status ?? 'present'
    return includeMissing || status === 'present' || status === 'partial'
  })

  console.log(`Seeding ${country} from ${manifestPath}`)
  console.log(`${eligible.length} document(s) eligible${dryRun ? ' (dry run)' : ''}\n`)

  let ingested = 0
  let skipped = 0
  let failed = 0
  for (const document of eligible) {
    const outcome = await ingest(document)
    if (outcome === 'ingested') ingested += 1
    else if (outcome === 'failed') failed += 1
    else skipped += 1
  }

  console.log(`\nDone: ${ingested} ingested, ${skipped} skipped, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
