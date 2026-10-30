/** HTTP bootstrap. */

import { existsSync, readFileSync } from 'node:fs'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes, seedReferenceImages } from './routes/index.js'
import { auth } from './auth.js'
import { config } from './config.js'
import { resetDemoState } from './demo-reset.js'
import { maintainAuditChain } from './audit-maintenance.js'
import type { PublicOperator } from '@sps/auth'

declare module 'fastify' {
  interface FastifyRequest {
    /** Operator established by the API-wide Bearer guard (`registerRoutes`). */
    operator?: PublicOperator
  }
}

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // The realtime voice socket carries the session token in its query string: never log it.
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url.replace(/([?&]token=)[^&]*/, '$1[redacted]'),
            host: request.hostname,
            remoteAddress: request.ip,
            remotePort: request.socket?.remotePort,
          }
        },
      },
    },
  })

  // Browser calls come from the console: the canonical origin, its aliases,
  // loopback and the private network. A self-hosted install with no configured
  // origin keeps the permissive policy, so a LAN name or a remapped port never
  // breaks it (see config.web.isAllowedOrigin).
  await app.register(cors, {
    origin: (origin, callback) => callback(null, config.web.isAllowedOrigin(origin)),
  })
  await registerRoutes(app)
  return app
}

/**
 * Reset the demo state at boot when `apps/api/scripts/reset-on-boot.flag` is
 * present. A local install can also run the script directly; the flag keeps the
 * container workflow identical.
 */
async function maybeResetOnBoot(app: FastifyInstance): Promise<void> {
  const flag = new URL('../scripts/reset-on-boot.flag', import.meta.url)
  if (!existsSync(flag)) return

  try {
    const result = await resetDemoState({
      uri: config.mongodb.uri,
      dbName: config.mongodb.dbName,
      serverSelectionTimeoutMs: 15_000,
    })
    app.log.warn(
      { database: result.database, deleted: result.deleted, collections: result.counts.map((entry) => entry.name) },
      'demo reset executed at boot (reset-on-boot.flag present)',
    )
  } catch (error) {
    // The console still boots: a failed wipe must never take the API down.
    app.log.error(
      { message: error instanceof Error ? error.message : 'unknown error' },
      'demo reset at boot failed',
    )
  }
}

/**
 * Audit-chain maintenance at boot: `apps/api/scripts/audit-chain.flag` set to
 * `check` logs the chain verdict, `purge` archives it and starts a new one.
 */
async function maybeMaintainAuditChain(app: FastifyInstance): Promise<void> {
  const flag = new URL('../scripts/audit-chain.flag', import.meta.url)
  if (!existsSync(flag)) return
  const mode = readFileSync(flag, 'utf8').trim()
  if (mode !== 'check' && mode !== 'purge') return
  try {
    const result = await maintainAuditChain({ uri: config.mongodb.uri, dbName: config.mongodb.dbName, mode })
    app.log.warn({ mode, before: result.before, after: result.after, archive: result.archive }, 'audit chain maintenance at boot')
  } catch (error) {
    app.log.error({ message: error instanceof Error ? error.message : 'unknown error' }, 'audit chain maintenance at boot failed')
  }
}

/**
 * Reference figures hatch: `apps/api/scripts/reference-images.flag` generates the
 * 13 readiness figures after the console answers. Idempotent, backgrounded.
 */
function maybeSeedReferenceImages(app: FastifyInstance): void {
  const flag = new URL('../scripts/reference-images.flag', import.meta.url)
  if (!existsSync(flag)) return
  void seedReferenceImages(app.log)
    .then((result) => app.log.warn(result, 'reference figures seeded at boot'))
    .catch((error) =>
      app.log.error({ message: error instanceof Error ? error.message : 'unknown error' }, 'reference figures seeding failed'),
    )
}

async function main(): Promise<void> {
  const app = await buildServer()
  await maybeMaintainAuditChain(app)

  // Before `auth.isEmpty()`: the console must see the store freshly emptied.
  await maybeResetOnBoot(app)

  // Accounts are created from the console: no seeded operator, no seeded password.
  const empty = await auth.isEmpty()
  app.log.info(
    { initialized: !empty, storage: auth.storage, mail: config.mail.mode },
    empty ? 'operator store empty · the console will show the root setup screen' : 'operator store ready',
  )
  if (empty) {
    app.log.info('Console mail transport: the invitation and reset links are written to the log and the outbox.')
  }

  try {
    await app.listen({ host: config.host, port: config.port })
    app.log.info(`SarkiAI Policy Sandbox API listening on http://${config.host}:${config.port}`)
    maybeSeedReferenceImages(app)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void main()
