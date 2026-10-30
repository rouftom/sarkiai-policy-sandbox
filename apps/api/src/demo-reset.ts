/**
 * Wipe the demo's operational state.
 *
 * Shared by `bun run demo:reset` and the boot hook
 * (`apps/api/scripts/reset-on-boot.flag`) for hosts without a shell.
 *
 * What goes: accounts, pending reset links, the hash-chained audit trail, CoT
 * traces, joint reports and approval decisions. What stays: the legal corpus
 * (`kb_chunks`), its Qdrant vectors and every configuration value.
 *
 * The connection string is never returned, logged or written to disk.
 */

import { MongoClient } from 'mongodb'

export const DEMO_RESET_COLLECTIONS = [
  'operators',
  'password_resets',
  'audit_logs',
  'cot_traces',
  'joint_reports',
  'approvals',
] as const

export type DemoResetCollection = (typeof DEMO_RESET_COLLECTIONS)[number]

export interface DemoResetCount {
  name: DemoResetCollection
  count: number
  present: boolean
}

export interface DemoResetResult {
  database: string
  counts: DemoResetCount[]
  deleted: number
  dryRun: boolean
}

export interface DemoResetOptions {
  uri: string
  dbName?: string
  /** Count only: never delete. */
  dryRun?: boolean
  /** Give up instead of hanging a boot when the cluster does not answer. */
  serverSelectionTimeoutMs?: number
}

export async function resetDemoState(options: DemoResetOptions): Promise<DemoResetResult> {
  const database = options.dbName ?? 'policy_sandbox'
  const dryRun = options.dryRun ?? false
  const client = new MongoClient(options.uri, {
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMs ?? 10_000,
  })

  try {
    await client.connect()
    const db = client.db(database)
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name),
    )

    const counts: DemoResetCount[] = []
    for (const name of DEMO_RESET_COLLECTIONS) {
      const present = existing.has(name)
      counts.push({ name, present, count: present ? await db.collection(name).countDocuments() : 0 })
    }

    if (dryRun) return { database, counts, deleted: 0, dryRun }

    let deleted = 0
    for (const entry of counts) {
      if (!entry.present) continue
      const result = await db.collection(entry.name).deleteMany({})
      deleted += result.deletedCount
    }

    return { database, counts, deleted, dryRun }
  } finally {
    await client.close().catch(() => {})
  }
}
