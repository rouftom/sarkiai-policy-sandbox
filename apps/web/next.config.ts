import type { NextConfig } from 'next'

/**
 * Origins that may reach this app (server actions CSRF allowlist).
 *
 * Nothing is hardcoded: the canonical origin comes from `NEXT_PUBLIC_WEB_URL`,
 * extra origins from `NEXT_PUBLIC_WEB_ORIGINS` / `WEB_PUBLIC_URL_ALIASES`, and
 * local development is always allowed. Next also accepts a same-origin request
 * whose `Origin` matches the `Host` header, so an on-premise install behind a
 * LAN name or a reverse proxy needs no extra configuration.
 */
function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function hostOf(value: string | undefined): string | null {
  const trimmed = firstNonEmpty(value)
  if (!trimmed) return null
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host
  } catch {
    return null
  }
}

function hostsOf(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => hostOf(entry))
    .filter((entry): entry is string => Boolean(entry))
}

const productionHost = hostOf(process.env.NEXT_PUBLIC_WEB_URL)

const devPort = firstNonEmpty(process.env.NEXT_PUBLIC_WEB_PORT) ?? '3000'

const deploymentOrigins = [
  ...new Set(
    [
      productionHost,
      ...hostsOf(process.env.NEXT_PUBLIC_WEB_ORIGINS),
      ...hostsOf(process.env.WEB_PUBLIC_URL_ALIASES),
      `localhost:${devPort}`,
    ].filter((host): host is string => Boolean(host)),
  ),
]

/**
 * Content-Security-Policy, limited to the two directives that matter for model
 * output rendered in the console: `img-src` (an injected image URL can leak data
 * in its query string) and `frame-src` (an injected frame can impersonate the
 * UI). Other resource types keep the browser defaults.
 *
 * Allowed: this app, inline data and blobs, and the API host (figures the
 * reports render). Extra hosts come from `NEXT_PUBLIC_CSP_IMG_SOURCES` and
 * `NEXT_PUBLIC_CSP_FRAME_SOURCES` (comma-separated origins). Set
 * `NEXT_PUBLIC_CSP_REPORT_ONLY=true` to observe violations without blocking.
 */
function originOfUrl(value: string | undefined): string | null {
  const trimmed = firstNonEmpty(value)
  if (!trimmed) return null
  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function originsOf(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => originOfUrl(entry))
    .filter((entry): entry is string => Boolean(entry))
}

function sourceList(values: (string | null | undefined)[]): string {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].join(' ')
}

const imgSources = sourceList([
  "'self'",
  'data:',
  'blob:',
  originOfUrl(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'),
  ...originsOf(process.env.NEXT_PUBLIC_CSP_IMG_SOURCES),
])

const frameSources = sourceList([
  "'self'",
  'data:',
  'blob:',
  ...originsOf(process.env.NEXT_PUBLIC_CSP_FRAME_SOURCES),
])

const cspHeader = process.env.NEXT_PUBLIC_CSP_REPORT_ONLY === 'true'
  ? 'Content-Security-Policy-Report-Only'
  : 'Content-Security-Policy'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: cspHeader, value: `img-src ${imgSources}; frame-src ${frameSources}` }],
      },
      {
        source: '/approve/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ]
  },
  // Workspace packages ship TypeScript sources (main → src/index.ts).
  transpilePackages: ['@sps/ui', '@sps/shared', '@sps/theme'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@sps/ui'],
    serverActions: { allowedOrigins: deploymentOrigins },
  },
}

export default nextConfig
