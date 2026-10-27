import { ensureSchema, insertEvents, deleteVisitor } from './db.js'
import { MAX_BODY_BYTES, isBot, normalizeBatch, originAllowed } from './events.js'
import { allowedHostsFrom, countryFrom, readJson } from './http.js'

// POST /api/hu/collect  — receives batches of anonymous usage events.
// It never fails loudly: analytics must not be able to break the app.
export function createCollectHandler({ getDb, now = Date.now, env = process.env, maxPerHour = 400 }) {
  const hosts = allowedHostsFrom(env)
  return async function collect(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).end()
    }
    if (isBot(req.headers['user-agent']) || !originAllowed(req.headers, hosts)) return res.status(204).end()

    const body = readJson(req, MAX_BODY_BYTES)
    if (body.error) return res.status(body.error === 'too_large' ? 413 : 400).end()
    const batch = normalizeBatch(body.value, now())
    if (!batch.ok) return res.status(400).json({ error: batch.reason })

    const db = getDb()
    if (!db) return res.status(204).end() // not configured yet
    try {
      await ensureSchema(db)
      await insertEvents(db, { ...batch, country: countryFrom(req.headers), maxPerHour })
    } catch (err) {
      console.error('analytics insert failed:', err?.message)
    }
    return res.status(204).end()
  }
}

// POST /api/hu/forget  — deletes everything stored for one anonymous visitor id.
export function createForgetHandler({ getDb, env = process.env }) {
  const hosts = allowedHostsFrom(env)
  return async function forget(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).end()
    }
    if (!originAllowed(req.headers, hosts)) return res.status(403).end()
    const body = readJson(req, 2_000)
    const vid = body.value?.vid
    if (typeof vid !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(vid)) return res.status(400).end()
    const db = getDb()
    if (!db) return res.status(204).end()
    try {
      await ensureSchema(db)
      await deleteVisitor(db, vid)
    } catch (err) {
      console.error('analytics forget failed:', err?.message)
      return res.status(500).end()
    }
    return res.status(204).end()
  }
}
