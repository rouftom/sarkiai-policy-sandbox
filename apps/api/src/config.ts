/** Runtime configuration for the API application layer. */

function required(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

export const config = {
  host: required('HOST', '0.0.0.0'),
  port: Number(required('PORT', '8000')),
  serviceApiKey: required('SERVICE_API_KEY'),

  qdrant: {
    url: required('QDRANT_URL', 'http://localhost:6333'),
    apiKey: required('QDRANT_API_KEY'),
    collection: required('QDRANT_COLLECTION', 'policy_chunks'),
  },

  // Operational store only (audit log + chain-of-thought); no vectors.
  mongodb: {
    uri: required('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: required('MONGODB_DB_NAME', 'policy_sandbox'),
  },

  ingestion: {
    baseUrl: required('INGESTION_URL', 'http://localhost:8001'),
    apiKey: required('SERVICE_API_KEY'),
  },

  voyage: {
    apiKey: required('VOYAGE_API_KEY'),
  },

  llm: {
    provider: required('DEFAULT_LLM_PROVIDER', 'deepseek') as 'deepseek',
    model: required('DEEPSEEK_MODEL', 'deepseek-chat'),
    apiKey: required('DEEPSEEK_API_KEY'),
  },
} as const
