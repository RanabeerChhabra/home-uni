import { createHash, timingSafeEqual } from 'node:crypto'
import { ensureSchema } from './db.js'
import { computeStats } from './stats.js'

const sha = (s) => createHash('sha256').update(String(s)).digest()

export function tokenMatches(provided, expected) {
  if (!expected || !provided) return false
  return timingSafeEqual(sha(provided), sha(expected))
}

// GET /api/hu/stats?days=30&tz=Asia/Kolkata  (Authorization: Bearer <ANALYTICS_ADMIN_TOKEN>)
export function createStatsHandler({ getDb, env = process.env, now = () => new Date() }) {
  return async function stats(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).end()
    }
    const expected = env.ANALYTICS_ADMIN_TOKEN
    if (!expected) return res.status(503).json({ error: 'not_configured', detail: 'ANALYTICS_ADMIN_TOKEN is not set' })

    const header = String(req.headers.authorization || '')
    const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!tokenMatches(provided, expected)) {
      await new Promise((r) => setTimeout(r, 400)) // slow down guessing
      return res.status(401).json({ error: 'unauthorized' })
    }

    const db = getDb()
    if (!db) return res.status(503).json({ error: 'no_database', detail: 'DATABASE_URL is not set' })

    const url = new URL(req.url, 'http://localhost')
    const days = Number(url.searchParams.get('days') || 30)
    const tz = url.searchParams.get('tz') || 'UTC'
    try {
      await ensureSchema(db)
      const data = await computeStats(db, { days: Number.isFinite(days) ? days : 30, tz, now: now() })
      return res.status(200).json(data)
    } catch (err) {
      console.error('analytics stats failed:', err?.message)
      return res.status(500).json({ error: 'stats_failed' })
    }
  }
}
