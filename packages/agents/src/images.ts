/**
 * Reference figures for the knowledge base.
 *
 * The figure is a labelled SVG diagram drawn here, deterministically: same
 * title and lines, same image. No image model, no network call, nothing that
 * could leave the institution. `source` stays `sample` so the console can say
 * the figure is generated from the assessment rather than scanned.
 */

export interface GeneratedImage {
  mime: string
  dataBase64: string
  source: 'sample'
  model: string
}

/** Labelled diagram used for a readiness dimension or a gap. */
export function sampleFigure(title: string, lines: string[]): GeneratedImage {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = lines
    .slice(0, 6)
    .map((line, index) => `<text x="60" y="${190 + index * 44}" font-size="26" fill="#334155">${escape(line)}</text>`)
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#f8fafc"/><rect x="40" y="40" width="1120" height="595" rx="28" fill="#ffffff" stroke="#0f766e" stroke-width="4"/><text x="60" y="120" font-size="40" font-weight="700" fill="#0f766e">${escape(title)}</text>${body}</svg>`
  return {
    mime: 'image/svg+xml',
    dataBase64: Buffer.from(svg, 'utf8').toString('base64'),
    source: 'sample',
    model: 'local-sample',
  }
}

/** The reference figure for an assessment section. Never throws, never calls out. */
export function referenceImage(fallback: { title: string; lines: string[] }): GeneratedImage {
  return sampleFigure(fallback.title, fallback.lines)
}
