export interface McpServerEntry {
  name: string;
  url: string;
  /** Local servers protected by the shared MCP_API_KEY (sent as `x-api-key`). */
  requiresApiKey?: boolean;
}

/**
 * The two MCP servers shipped with the local stack (services/mcp-charts,
 * services/mcp-docx). Nothing is fetched from a hosted copy: the proxy below
 * resolves these names on the server and forwards the shared key there.
 */
export const MCP_SERVERS: McpServerEntry[] = [
  {
    name: 'sarkiai_charts',
    url: process.env.MCP_CHARTS_URL || 'http://localhost:8010/mcp',
    requiresApiKey: true,
  },
  {
    name: 'sea_mcp_docx',
    url: process.env.MCP_DOCX_URL || 'http://localhost:8011/mcp',
    requiresApiKey: true,
  },
];

/**
 * Server-side only: authentication headers for a first-party MCP server.
 * Never sends the key to third-party servers. Returns an empty object when the
 * key is not available (e.g. when evaluated in a browser bundle).
 */
export function getMcpAuthHeaders(server?: Pick<McpServerEntry, 'requiresApiKey'> | null): Record<string, string> {
  const key = process.env.MCP_API_KEY;
  if (!server?.requiresApiKey || !key) return {};
  return { 'x-api-key': key };
}
