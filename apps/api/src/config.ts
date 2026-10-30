/** Runtime configuration for the API application layer.
 *
 * Everything here points at the on-premise stack: Ollama for the chat model and
 * embeddings, Qdrant for the vector store, MongoDB for the operational records,
 * MinIO for attachments. There is no cloud deployment, no hosted inference and
 * no external messaging gateway to configure.
 */

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

/**
 * Console origins.
 *
 * `WEB_PUBLIC_URL` is the canonical origin (every link the API sends is built
 * from it); `WEB_PUBLIC_URL_ALIASES` lists any other origin that must keep
 * working (previous host, staging, second console). Without them the console is
 * assumed to run locally. On-premise installs are the reason the policy is not
 * closed by default: a `docker compose up` behind a LAN name or a reverse proxy
 * cannot know its own public origin.
 */
const DEV_ORIGIN = `http://localhost:${env('WEB_DEV_PORT', '3000')}`

function originOf(value: string | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function originList(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => originOf(entry))
    .filter((entry): entry is string => Boolean(entry))
}

const configuredOrigin = originOf(env('WEB_PUBLIC_URL'))
const publicOrigin = configuredOrigin ?? DEV_ORIGIN

const publicOrigins = [
  ...new Set([publicOrigin, ...originList(env('WEB_PUBLIC_URL_ALIASES')), DEV_ORIGIN]),
]

/**
 * Origins that only come from the private network: loopback on any port, RFC1918
 * and link-local addresses, single-label hostnames (container or host name), and
 * the private DNS suffixes. Those are always accepted so a local install never
 * breaks on a port change, a LAN address or an internal hostname.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const PRIVATE_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa']

function isLocalOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    if (LOOPBACK_HOSTS.has(hostname)) return true

    const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (v4) {
      const a = Number(v4[1])
      const b = Number(v4[2])
      return (
        a === 10 ||
        a === 127 ||
        (a === 192 && b === 168) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 169 && b === 254)
      )
    }

    if (!hostname.includes('.')) return true
    return hostname === 'home.arpa' || PRIVATE_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  } catch {
    return false
  }
}

export interface OriginPolicy {
  /** Canonical origin plus configured aliases. */
  origins: string[]
  /** Accept every origin (self-hosted default until a canonical origin is set). */
  allowAny: boolean
}

/** Whether a browser origin may call the API. */
export function isOriginAllowed(origin: string | undefined, policy: OriginPolicy): boolean {
  if (!origin) return true
  if (policy.allowAny) return true
  const candidate = originOf(origin)
  if (!candidate) return false
  return policy.origins.includes(candidate) || isLocalOrigin(candidate)
}

/**
 * Runtime policy. An explicit `WEB_PUBLIC_URL` closes the allowlist; a bare
 * install keeps the open behaviour so no on-premise setup breaks on upgrade.
 * Private-network origins are accepted either way.
 */
const originPolicy: OriginPolicy = {
  origins: publicOrigins,
  allowAny:
    env('WEB_ALLOW_ANY_ORIGIN').toLowerCase() === 'true' || !configuredOrigin,
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  return isOriginAllowed(origin, originPolicy)
}

export const config = {
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '8000')),
  serviceApiKey: env('SERVICE_API_KEY'),

  // Single vector backend: Qdrant (dense bge-m3 + BM25 sparse, RRF fusion).
  qdrant: {
    url: env('QDRANT_URL', 'http://localhost:6333'),
    apiKey: env('QDRANT_API_KEY'),
    collection: env('QDRANT_COLLECTION', 'policy_chunks'),
    denseVector: env('QDRANT_DENSE_VECTOR', 'dense'),
    sparseVector: env('QDRANT_SPARSE_VECTOR', 'text'),
    sparseModel: env('QDRANT_SPARSE_MODEL', 'Qdrant/bm25'),
  },

  // Operational store: audit chain, runs, contacts, chat sessions, KB images.
  // No vectors live here.
  mongodb: {
    uri: env('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: env('MONGODB_DB_NAME', 'policy_sandbox'),
  },

  // Local Python ingestion service (chunking + Ollama embeddings + Qdrant).
  ingestion: {
    baseUrl: env('INGESTION_URL', 'http://localhost:8001'),
    apiKey: env('SERVICE_API_KEY'),
  },

  // Local faster-whisper service.
  transcription: {
    url: env('TRANSCRIPTION_URL', 'http://localhost:8003'),
  },

  // Local Tesseract OCR service (scanned gazette pages).
  ocr: {
    url: env('OCR_URL', 'http://localhost:8004'),
  },

  // Local LLM (Ollama, OpenAI-compatible). qwen3.5:9b is multimodal (text+image).
  ollama: {
    baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: env('OLLAMA_MODEL', 'qwen3.5:9b'),
  },

  // Local embeddings (Ollama).
  embeddings: {
    baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: env('EMBEDDING_MODEL', 'bge-m3'),
  },

  // Optional local reranker (TEI). Empty URL => RRF-only.
  rerank: {
    url: env('RERANK_URL'),
    model: env('RERANK_MODEL', 'BAAI/bge-reranker-v2-m3'),
  },

  // Object storage (MinIO / S3) for assistant attachments.
  s3: {
    endpoint: env('S3_ENDPOINT', 'http://localhost:9000'),
    bucket: env('S3_BUCKET', 'sps-attachments'),
    accessKey: env('S3_ACCESS_KEY', 'sps-minio'),
    secretKey: env('S3_SECRET_KEY', 'sps-minio-secret'),
  },

  // Operator auth: session signing only. Accounts are created from the console's
  // one-time setup screen; no password is seeded from the environment.
  auth: {
    sessionSecret: env('SESSION_SECRET') || env('APPROVAL_SECRET'),
    /** Self-service sign-up is closed on a local install; the setup screen creates the first operator. */
    signup: env('AUTH_SIGNUP', 'false') === 'true',
    maxOperators: Number(env('AUTH_MAX_OPERATORS', '12')) || 12,
  },

  // Signed approval links. The decision is taken in the console.
  approvals: {
    secret: env('APPROVAL_SECRET') || env('SESSION_SECRET'),
  },

  // Transactional e-mail. Console mode: messages are written to the log and the
  // in-API outbox, never sent over the network. `from` labels them.
  mail: {
    mode: 'console' as const,
    from: env('MAIL_FROM', 'SarkiAI Policy Sandbox <sandbox@localhost>'),
    replyTo: env('MAIL_REPLY_TO'),
    publicUrl: publicOrigin,
  },

  // The console's own origins. `canonicalUrl` builds every link we send (auth
  // e-mails, approval buttons); `allowedOrigins` is what the CORS layer accepts.
  web: {
    canonicalUrl: publicOrigin,
    allowedOrigins: publicOrigins,
    isAllowedOrigin,
  },
} as const
