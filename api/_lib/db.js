// Storage for analytics events: a single Postgres table.
//
// In production this talks to Neon over HTTP (DATABASE_URL, set by Vercel's Neon
// integration). Tests inject an in-process Postgres (PGlite) with the same
// `query(text, params) -> rows` shape, so the real SQL is exercised.

import { neon } from '@neondatabase/serverless'

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
     id       BIGSERIAL PRIMARY KEY,
     ts       TIMESTAMPTZ NOT NULL,
     vid      TEXT NOT NULL,
     sid      TEXT NOT NULL,
     name     TEXT NOT NULL,
     props    JSONB NOT NULL DEFAULT '{}'::jsonb,
     country  TEXT,
     device   TEXT,
     tzo      INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts)`,
  `CREATE INDEX IF NOT EXISTS events_vid_ts_idx ON events (vid, ts)`,
  `CREATE INDEX IF NOT EXISTS events_name_ts_idx ON events (name, ts)`,
]

// Events older than this are deleted. Keeps the table small and limits how long
// anything is kept.
export const RETENTION_DAYS = 400

const ready = new WeakMap()

export function ensureSchema(db) {
  if (!ready.has(db)) {
    const p = (async () => {
      for (const statement of SCHEMA) await db.query(statement, [])
      await db.query(`DELETE FROM events WHERE ts < now() - ($1 || ' days')::interval`, [String(RETENTION_DAYS)])
    })()
    p.catch(() => ready.delete(db))
    ready.set(db, p)
  }
  return ready.get(db)
}

let cached
export function getDb(env = process.env) {
  const url = env.DATABASE_URL || env.POSTGRES_URL
  if (!url) return null
  if (!cached || cached.url !== url) {
    const sql = neon(url)
    cached = { url, db: { query: (text, params = []) => sql.query(text, params) } }
  }
  return cached.db
}

/**
 * Inserts a validated batch in ONE statement. The per-visitor hourly cap is
 * enforced inside the same statement, so spam costs no extra round trip.
 * Returns the number of rows inserted.
 */
export async function insertEvents(db, { vid, sid, ctx, country, events, maxPerHour = 400 }) {
  const rows = await db.query(
    `WITH ok AS (
       SELECT (SELECT count(*) FROM events WHERE vid = $2 AND ts > now() - interval '1 hour') < $9::int AS allowed
     ), ins AS (
       INSERT INTO events (ts, vid, sid, name, props, country, device, tzo)
       SELECT e.ts, $2::text, $3::text, e.name, e.props::jsonb, $4::text, $5::text, $6::int
       FROM unnest($1::timestamptz[], $7::text[], $8::text[]) AS e(ts, name, props), ok
       WHERE ok.allowed
       RETURNING 1
     )
     SELECT count(*)::int AS inserted FROM ins`,
    [
      events.map((e) => e.ts.toISOString()),
      vid,
      sid,
      country ?? null,
      ctx.device ?? null,
      ctx.tzo ?? null,
      events.map((e) => e.name),
      events.map((e) => JSON.stringify(e.props)),
      maxPerHour,
    ],
  )
  return Number(rows[0]?.inserted ?? 0)
}

export async function deleteVisitor(db, vid) {
  const rows = await db.query(
    `WITH d AS (DELETE FROM events WHERE vid = $1 RETURNING 1) SELECT count(*)::int AS n FROM d`,
    [vid],
  )
  return Number(rows[0]?.n ?? 0)
}
