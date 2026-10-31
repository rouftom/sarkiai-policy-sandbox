#!/usr/bin/env bun
/**
 * Check what the repository publishes from the knowledge base.
 *
 *   bun scripts/check-kb.ts
 *
 * Reads every manifest.json under data/ and the files git would commit under
 * data/ (tracked, or untracked and not ignored), then enforces the rights
 * review recorded in data/KNOWLEDGE-BASE.md:
 *
 *   - a country payload may be published only when its manifest entry says
 *     rights: official-text or open-licence;
 *   - payloads of a manifest with a `distribution` field (global corpora) are
 *     never published: they are linked or fetched, not redistributed;
 *   - every published payload is declared in a manifest or listed below as a
 *     known file (samples, third-party MIT files, docs);
 *   - no published file reaches GitHub's 100 MB limit.
 *
 * Warnings (no failure): a published official text without sourceUrl, a file
 * above 50 MB, an official text present locally but not published.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

interface ManifestDocument {
  id?: string
  file?: string
  status?: string
  rights?: string
  sourceUrl?: string
}

interface Manifest {
  distribution?: string
  documents?: ManifestDocument[]
}

const ROOT = resolve(import.meta.dir, '..')
const DATA = join(ROOT, 'data')
const MB = 1024 * 1024
const PUBLISHABLE = new Set(['official-text', 'open-licence'])

/** Files under data/ that are not corpus payloads, or are third-party MIT files. */
const KNOWN = [
  /^data\/KNOWLEDGE-BASE\.md$/,
  /^data\/(.+\/)?(README\.md|manifest\.json|\.gitkeep)$/,
  /^data\/global\/LICENSE-ITUAIReadiness$/,
  /^data\/global\/itu\/(dimensions\.json|EU_AI_Act_summary\.txt|ITU_AI4G_Sandbox_summary\.txt)$/,
  /^data\/global\/africa\/Kenya_AI_Strategy_2025_2030_summary\.txt$/,
  /^data\/samples\/[^/]+\.txt$/,
]

function git(args: string[]): string[] {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function manifests(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...manifests(path))
    else if (entry === 'manifest.json') found.push(path)
  }
  return found
}

const published = new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'data']))
const errors: string[] = []
const warnings: string[] = []
const declared = new Set<string>()
let publishedPayloads = 0

for (const manifestPath of manifests(DATA)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  const dir = dirname(manifestPath)
  for (const document of manifest.documents ?? []) {
    const file = document.file?.trim()
    if (!file) continue
    const path = relative(ROOT, join(dir, file))
    declared.add(path)
    const label = document.id ?? file
    const isPublished = published.has(path)

    if (isPublished) {
      publishedPayloads += 1
      if (manifest.distribution) {
        errors.push(`${path}: this corpus is not redistributed (${manifest.distribution.split(':')[0]}); untrack it.`)
      } else if (!PUBLISHABLE.has(document.rights ?? '')) {
        errors.push(`${path}: rights is "${document.rights ?? 'unset'}", only official-text or open-licence may be published.`)
      } else if (!document.sourceUrl?.trim()) {
        warnings.push(`${label}: published without sourceUrl; record where the copy comes from.`)
      }
      const full = join(ROOT, path)
      if (existsSync(full)) {
        const size = statSync(full).size
        if (size >= 100 * MB) errors.push(`${path}: ${(size / MB).toFixed(0)} MB, above GitHub's 100 MB limit (use Git LFS).`)
        else if (size >= 50 * MB) warnings.push(`${path}: ${(size / MB).toFixed(0)} MB, GitHub warns above 50 MB (Git LFS recommended).`)
      }
    } else if (!manifest.distribution && PUBLISHABLE.has(document.rights ?? '') && existsSync(join(ROOT, path))) {
      warnings.push(`${path}: publishable document present locally but not published (missing from the .gitignore allow-list?).`)
    }
  }
}

for (const path of published) {
  if (declared.has(path) || KNOWN.some((pattern) => pattern.test(path))) continue
  errors.push(`${path}: published but declared in no manifest; add it to a manifest or keep it local.`)
}

for (const warning of warnings) console.warn(`warn   ${warning}`)
for (const error of errors) console.error(`error  ${error}`)
console.log(`\n${publishedPayloads} corpus payload(s) published, ${warnings.length} warning(s), ${errors.length} error(s).`)
process.exit(errors.length ? 1 : 0)
