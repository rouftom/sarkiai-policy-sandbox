import { describe, expect, test } from 'bun:test'
import Fastify from 'fastify'
import { createApprovalToken } from './approval-token.js'
import { MAX_PARAM_LENGTH } from './router-limits.js'

/**
 * A signed approval link carries its token in the path, and the token is longer
 * than Fastify's 100-character default. These tests pin both facts: the token
 * length, and the fact that only a raised `maxParamLength` serves the link.
 */
const TEST_KEY = 'test-only-approval-key'

function realisticToken(): string {
  return createApprovalToken({
    runId: '3f1c9a76-1d2e-4f6a-9b7c-5e8d0a1b2c3d',
    secret: TEST_KEY,
    subject: 'Readiness report for Cameroon, digital transformation domain, August 2026',
    userId: 'analyst@example.org',
  }).token
}

function approvalApp(maxParamLength?: number) {
  const app = Fastify(maxParamLength ? { routerOptions: { maxParamLength } } : {})
  app.get('/v1/approvals/:token', async (request) => ({
    token: (request.params as { token: string }).token,
  }))
  return app
}

describe('approval link routing', () => {
  test('a real approval token exceeds the router default of 100 characters', () => {
    expect(realisticToken().length).toBeGreaterThan(100)
  })

  test('the configured limit serves the link', async () => {
    const app = approvalApp(MAX_PARAM_LENGTH)
    try {
      const token = realisticToken()
      const response = await app.inject({ method: 'GET', url: `/v1/approvals/${token}` })
      expect(response.statusCode).toBe(200)
      expect(response.json() as { token: string }).toEqual({ token })
    } finally {
      await app.close()
    }
  })

  test('the default limit rejects the link with 414, which is why the option exists', async () => {
    const app = approvalApp()
    try {
      const response = await app.inject({ method: 'GET', url: `/v1/approvals/${realisticToken()}` })
      expect(response.statusCode).toBe(414)
    } finally {
      await app.close()
    }
  })
})
