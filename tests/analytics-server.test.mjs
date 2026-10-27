import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { ensureSchema, insertEvents, deleteVisitor } from '../api/_lib/db.js'
import { cleanProps, isBot, normalizeBatch, originAllowed, EVENT_NAMES } from '../api/_lib/events.js'
import { createCollectHandler, createForgetHandler } from '../api/_lib/collect.js'
import { createStatsHandler, tokenMatches } from '../api/_lib/statsHandler.js'
import { computeStats, safeTimeZone } from '../api/_lib/stats.js'

async function freshDb() {
  const pg = new PGlite()
  const db = { query: async (text, params = []) => (await pg.query(text, params)).rows }
  await ensureSchema(db)
  return db
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined }
  res.status = (c) => ((res.statusCode = c), res)
  res.setHeader = (k, v) => ((res.headers[k.toLowerCase()] = v), res)
  res.json = (b) => ((res.body = b), res)
  res.end = () => res
  return res
}
const post = (body, headers = {}) => ({
  method: 'POST',
  body,
  headers: { 'user-agent': 'Mozilla/5.0 Chrome', origin: 'https://rana.beer', ...headers },
})
const VID = 'aaaaaaaa-1111-2222-3333-444444444444'
const SID = 'bbbbbbbb-1111-2222-3333-444444444444'
const batch = (events, extra = {}) => ({ vid: VID, sid: SID, ctx: { dev: 'mobile', tzo: 330 }, events, ...extra })
const count = async (db, where = 'true', params = []) =>
  Number((await db.query(`SELECT count(*) AS n FROM events WHERE ${where}`, params))[0].n)

// ── validation ──

test('only known events and properties survive; free text is dropped', () => {
  const props = cleanProps('plan_started', {
    topic: 'coding',
    level: 'Beginner',
    focus: ['web', 'programming', 'has spaces', 42],
    goal: 'my secret goal about my employer',
    goal_text: 'also secret',
    email: 'me@example.com',
    minutes: 30,
    days: 3.4,
  })
  assert.deepEqual(props, { topic: 'coding', level: 'Beginner', focus: ['web', 'programming'], minutes: 30, days: 3 })
  assert.equal(JSON.stringify(props).includes('secret'), false)
})

test('values are type-checked and clamped', () => {
  assert.deepEqual(cleanProps('plan_started', { topic: 'astrology', level: 'Guru', format: 'audio' }), {})
  assert.deepEqual(cleanProps('session_done', { mins: 1e12 }), { mins: 1_000_000 })
  assert.deepEqual(cleanProps('app_open', { returning: 'yes', visit: '3' }), {})
  assert.deepEqual(cleanProps('nope', { a: 1 }), {})
})

test('error messages are single-line, short, and have URLs removed', () => {
  const p = cleanProps('js_error', {
    msg: `Failed at https://rana.beer/homeuni/?token=abc\nsecond line ${'x'.repeat(300)}`,
    where: 'App',
  })
  assert.ok(!p.msg.includes('http'))
  assert.ok(!p.msg.includes('\n'))
  assert.ok(p.msg.length <= 140)
  assert.ok(p.msg.includes('<url>'))
})

test('batches are validated', () => {
  const now = Date.UTC(2026, 9, 28, 12)
  assert.equal(normalizeBatch(null).ok, false)
  assert.equal(normalizeBatch({ vid: 'short', sid: SID, events: [{ n: 'app_open' }] }).reason, 'bad_vid')
  assert.equal(normalizeBatch({ vid: VID, sid: 'x y', events: [{ n: 'app_open' }] }).reason, 'bad_sid')
  assert.equal(normalizeBatch({ vid: VID, sid: SID, events: [] }).reason, 'no_events')
  assert.equal(normalizeBatch({ vid: VID, sid: SID, events: [{ n: 'hack' }, { n: 5 }] }).reason, 'no_valid_events')
  const ok = normalizeBatch(batch([{ n: 'app_open', p: { returning: true }, dt: 5000 }, { n: 'bogus' }]), now)
  assert.equal(ok.ok, true)
  assert.equal(ok.events.length, 1)
  assert.equal(ok.events[0].ts.getTime(), now - 5000)
  assert.equal(ok.ctx.device, 'mobile')
  assert.equal(ok.ctx.tzo, 330)
})

test('event timestamps cannot be backdated by more than a day or set in the future', () => {
  const now = Date.UTC(2026, 9, 28, 12)
  const b = normalizeBatch(
    batch([
      { n: 'app_open', dt: 10 * 86400000 },
      { n: 'app_open', dt: -5000 },
    ]),
    now,
  )
  assert.equal(b.events[0].ts.getTime(), now - 86400000)
  assert.equal(b.events[1].ts.getTime(), now)
})

test('batches are capped at 40 events', () => {
  const events = Array.from({ length: 100 }, () => ({ n: 'visible_time', p: { s: 5 } }))
  assert.equal(normalizeBatch(batch(events)).events.length, 40)
})

test('bots and foreign origins are recognised', () => {
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true)
  assert.equal(isBot('HeadlessChrome/120'), true)
  assert.equal(isBot(undefined), true)
  assert.equal(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1'), false)
  assert.equal(originAllowed({ origin: 'https://rana.beer' }, ['rana.beer']), true)
  assert.equal(originAllowed({ origin: 'https://evil.example' }, ['rana.beer']), false)
  assert.equal(originAllowed({}, ['rana.beer']), true)
})

test('every event name has a spec', () => {
  for (const name of [
    'app_open',
    'wizard_step',
    'plan_started',
    'session_done',
    'resource_click',
    'quiz_complete',
    'visible_time',
  ]) {
    assert.ok(EVENT_NAMES.includes(name), name)
  }
})

// ── collect endpoint ──

test('collect stores a valid batch with country and device, and never the IP or user agent', async () => {
  const db = await freshDb()
  const handler = createCollectHandler({ getDb: () => db })
  const res = mockRes()
  await handler(
    post(
      batch([
        { n: 'app_open', p: { returning: false, visit: 1, lang: 'en' }, dt: 0 },
        { n: 'wizard_step', p: { step: 'topic', idx: 0, dir: 'next' } },
      ]),
      {
        'x-vercel-ip-country': 'in',
      },
    ),
    res,
  )
  assert.equal(res.statusCode, 204)
  const rows = await db.query('SELECT * FROM events ORDER BY id')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].country, 'IN')
  assert.equal(rows[0].device, 'mobile')
  assert.equal(rows[0].tzo, 330)
  assert.deepEqual(Object.keys(rows[0]).sort(), ['country', 'device', 'id', 'name', 'props', 'sid', 'ts', 'tzo', 'vid'])
})

test('collect accepts text/plain bodies (sendBeacon) as well as parsed JSON', async () => {
  const db = await freshDb()
  const handler = createCollectHandler({ getDb: () => db })
  const res = mockRes()
  await handler(post(JSON.stringify(batch([{ n: 'app_open', p: {} }]))), res)
  assert.equal(res.statusCode, 204)
  assert.equal(await count(db), 1)
})

test('collect rejects bad input without storing anything', async () => {
  const db = await freshDb()
  const handler = createCollectHandler({ getDb: () => db })
  for (const [body, status] of [
    ['not json{', 400],
    [JSON.stringify({ vid: 'x' }), 400],
    ['x'.repeat(30_000), 413],
  ]) {
    const res = mockRes()
    await handler(post(body), res)
    assert.equal(res.statusCode, status, String(body).slice(0, 20))
  }
  const get = mockRes()
  await handler({ method: 'GET', headers: {} }, get)
  assert.equal(get.statusCode, 405)
  assert.equal(await count(db), 0)
})

test('collect silently ignores bots and foreign origins', async () => {
  const db = await freshDb()
  const handler = createCollectHandler({ getDb: () => db })
  for (const headers of [{ 'user-agent': 'Googlebot/2.1' }, { origin: 'https://evil.example' }]) {
    const res = mockRes()
    await handler(post(batch([{ n: 'app_open' }]), headers), res)
    assert.equal(res.statusCode, 204)
  }
  assert.equal(await count(db), 0)
})

test('collect never fails the request if the database is missing or broken', async () => {
  const noDb = createCollectHandler({ getDb: () => null })
  const res1 = mockRes()
  await noDb(post(batch([{ n: 'app_open' }])), res1)
  assert.equal(res1.statusCode, 204)

  const broken = createCollectHandler({
    getDb: () => ({
      query: async () => {
        throw new Error('boom')
      },
    }),
  })
  const res2 = mockRes()
  const original = console.error
  console.error = () => {}
  await broken(post(batch([{ n: 'app_open' }])), res2)
  console.error = original
  assert.equal(res2.statusCode, 204)
})

test('a single visitor cannot flood the table', async () => {
  const db = await freshDb()
  const handler = createCollectHandler({ getDb: () => db, maxPerHour: 10 })
  for (let i = 0; i < 5; i++) {
    await handler(post(batch(Array.from({ length: 6 }, () => ({ n: 'visible_time', p: { s: 1 } })))), mockRes())
  }
  // the cap is checked per request, so the table stops growing soon after the limit
  const total = await count(db, 'vid = $1', [VID])
  assert.ok(total <= 12, `stored ${total}`)
  assert.ok(total >= 6)
})

test('forget deletes one visitor and leaves others alone', async () => {
  const db = await freshDb()
  const collect = createCollectHandler({ getDb: () => db })
  const other = 'cccccccc-1111-2222-3333-444444444444'
  await collect(post(batch([{ n: 'app_open' }, { n: 'new_plan' }])), mockRes())
  await collect(post(batch([{ n: 'app_open' }], { vid: other })), mockRes())
  assert.equal(await count(db), 3)
  const forget = createForgetHandler({ getDb: () => db })
  const bad = mockRes()
  await forget(post({ vid: 'nope' }), bad)
  assert.equal(bad.statusCode, 400)
  const res = mockRes()
  await forget(post({ vid: VID }), res)
  assert.equal(res.statusCode, 204)
  assert.equal(await count(db, 'vid = $1', [VID]), 0)
  assert.equal(await count(db, 'vid = $1', [other]), 1)
  assert.equal(await deleteVisitor(db, other), 1)
})

test('old events are purged and the schema is safe to run repeatedly', async () => {
  const pg = new PGlite()
  const db = { query: async (t, p = []) => (await pg.query(t, p)).rows }
  await ensureSchema(db)
  await pg.query(
    `INSERT INTO events (ts, vid, sid, name) VALUES (now() - interval '500 days', 'old-visitor-1', 's1', 'app_open'), (now(), 'new-visitor-1', 's1', 'app_open')`,
  )
  const db2 = { query: db.query } // a new object = a new "cold start"
  await ensureSchema(db2)
  assert.equal(await count(db), 1)
})

// ── stats, against a seeded scenario with known answers ──

const NOW = new Date('2026-10-28T12:00:00Z')
const at = (iso) => new Date(iso)
async function seed(db) {
  const ev = (vid, name, iso, props = {}, extra = {}) =>
    insertEvents(db, {
      vid,
      sid: `${vid}-${iso.slice(0, 10)}`,
      ctx: { device: extra.device ?? 'mobile', tzo: extra.tzo ?? 0 },
      country: extra.country ?? 'IN',
      events: [{ name, props, ts: at(iso) }],
      maxPerHour: 10_000,
    })
  const A = 'visitor-aaaa-0001'
  const B = 'visitor-bbbb-0002'
  const C = 'visitor-cccc-0003'
  const D = 'visitor-dddd-0004'
  const E = 'visitor-eeee-0005'
  // A: committed learner, came back on days 1 and 5, in IST (+330)
  const t = { tzo: 330 }
  await ev(A, 'app_open', '2026-10-20T09:00:00Z', { returning: false, visit: 1, ref: 'twitter.com', lang: 'en' }, t)
  for (const [i, step] of ['topic', 'level', 'focus', 'goal', 'format', 'pace', 'review'].entries())
    await ev(A, 'wizard_step', `2026-10-20T09:0${i}:00Z`, { step, idx: i, dir: 'next' }, t)
  await ev(
    A,
    'plan_started',
    '2026-10-20T09:05:00Z',
    {
      topic: 'coding',
      level: 'Beginner',
      focus: ['web', 'programming'],
      reasons: ['curiosity'],
      format: 'mix',
      days: 3,
      minutes: 30,
      goal_len: 20,
      sessions: 30,
    },
    t,
  )
  await ev(
    A,
    'resource_click',
    '2026-10-20T09:06:00Z',
    { item: 'cod-b-2', part: 1, type: 'video', topic: 'coding', level: 'Beginner' },
    t,
  )
  await ev(
    A,
    'resource_click',
    '2026-10-21T09:06:00Z',
    { item: 'cod-b-2', part: 2, type: 'video', topic: 'coding', level: 'Beginner' },
    t,
  )
  await ev(
    A,
    'session_done',
    '2026-10-20T09:30:00Z',
    { topic: 'coding', level: 'Beginner', mins: 30, units: 1, items: ['cod-b-2'] },
    t,
  )
  await ev(A, 'app_open', '2026-10-21T09:00:00Z', { returning: true, visit: 2 }, t)
  await ev(
    A,
    'session_done',
    '2026-10-21T09:30:00Z',
    { topic: 'coding', level: 'Beginner', mins: 30, units: 1, items: ['cod-b-2'] },
    t,
  )
  await ev(A, 'app_open', '2026-10-25T09:00:00Z', { returning: true, visit: 3 }, t)
  await ev(
    A,
    'session_done',
    '2026-10-25T09:30:00Z',
    { topic: 'coding', level: 'Beginner', mins: 30, units: 1, items: ['cod-b-2'] },
    t,
  )
  await ev(
    A,
    'session_done',
    '2026-10-25T10:00:00Z',
    { topic: 'coding', level: 'Beginner', mins: 30, units: 1, items: ['cod-b-2'] },
    t,
  )
  await ev(
    A,
    'quiz_complete',
    '2026-10-25T10:10:00Z',
    { topic: 'coding', level: 'Beginner', correct: 4, total: 5, attempt: 0 },
    t,
  )
  await ev(A, 'visible_time', '2026-10-25T10:20:00Z', { s: 600 }, t)
  // B: opens the app, reaches the level step, leaves
  await ev(
    B,
    'app_open',
    '2026-10-27T10:00:00Z',
    { returning: false, visit: 1, lang: 'hi' },
    { country: 'US', device: 'desktop' },
  )
  await ev(
    B,
    'wizard_step',
    '2026-10-27T10:00:10Z',
    { step: 'topic', idx: 0, dir: 'next' },
    { country: 'US', device: 'desktop' },
  )
  await ev(
    B,
    'wizard_step',
    '2026-10-27T10:00:20Z',
    { step: 'level', idx: 1, dir: 'next' },
    { country: 'US', device: 'desktop' },
  )
  // C: builds a finance plan, returns on D+1
  await ev(C, 'app_open', '2026-10-27T10:00:00Z', { returning: false, visit: 1 })
  await ev(C, 'plan_started', '2026-10-27T10:30:00Z', {
    topic: 'finance',
    level: 'Beginner',
    focus: [],
    reasons: [],
    format: 'videos',
    days: 5,
    minutes: 15,
    goal_len: 0,
    sessions: 20,
  })
  await ev(C, 'session_done', '2026-10-27T11:00:00Z', {
    topic: 'finance',
    level: 'Beginner',
    mins: 15,
    units: 1,
    items: ['fin-b-1'],
  })
  await ev(C, 'app_open', '2026-10-28T08:00:00Z', { returning: true, visit: 2 })
  await ev(C, 'js_error', '2026-10-28T08:01:00Z', { msg: 'Cannot read properties of undefined', where: 'Dashboard' })
  // D: only opens the app today
  await ev(D, 'app_open', '2026-10-28T09:00:00Z', { returning: false, visit: 1 })
  // E: seen long ago (outside the 30 day window)
  await ev(E, 'app_open', '2026-08-01T09:00:00Z', { returning: false, visit: 1 })
  return { A, B, C, D, E }
}

test('stats: headline numbers', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  assert.equal(s.totals.visitors, 4)
  assert.equal(s.totals.allTime, 5)
  assert.equal(s.totals.today, 2) // C and D
  assert.equal(s.totals.last7, 4)
  assert.equal(s.totals.plansStarted, 2)
  assert.equal(s.totals.planners, 2)
  assert.equal(s.totals.sessionsDone, 5)
  assert.equal(s.totals.learners, 2)
  assert.equal(s.totals.returningVisitors, 2) // A, C
})

test('stats: the funnel', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  const f = Object.fromEntries(s.funnel.map((r) => [r.key, r.visitors]))
  assert.deepEqual(f, {
    opened: 4,
    wizard: 2,
    planned: 2,
    first_session: 2,
    three_sessions: 1,
    quizzed: 1,
    came_back: 2,
    finished_plan: 0,
  })
})

test('stats: where people leave the setup wizard', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  const reached = Object.fromEntries(s.wizard.steps.map((x) => [x.step, x.visitors]))
  assert.deepEqual(reached, { topic: 2, level: 2, focus: 1, goal: 1, format: 1, pace: 1, review: 1 })
})

test('stats: what people choose', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  const get = (dim) => Object.fromEntries((s.choices[dim] ?? []).map((r) => [r.value, r.n]))
  assert.deepEqual(get('topic'), { coding: 1, finance: 1 })
  assert.deepEqual(get('format'), { mix: 1, videos: 1 })
  assert.deepEqual(get('focus'), { 'coding: web': 1, 'coding: programming': 1 })
  assert.deepEqual(get('session_minutes'), { 15: 1, 30: 1 })
  assert.deepEqual(get('wrote_a_goal'), { yes: 1, no: 1 })
})

test('stats: retention counts only people who had time to come back', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  // first seen <= yesterday: A, B, C. Returned next day: A, C.
  assert.deepEqual(s.retention.day1, { eligible: 3, returned: 2, rate: 66.7 })
  // first seen <= 7 days ago: only A, who returned within a week
  assert.deepEqual(s.retention.week1, { eligible: 1, returned: 1, rate: 100 })
})

test('stats: resources people click and finish, with real titles', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  assert.equal(s.resources.clicked[0].id, 'cod-b-2')
  assert.equal(s.resources.clicked[0].n, 2)
  assert.equal(s.resources.clicked[0].people, 1)
  assert.match(s.resources.clicked[0].title, /JavaScript/)
  assert.equal(s.resources.completed[0].id, 'cod-b-2')
  assert.equal(s.resources.completed[0].n, 4)
})

test('stats: daily series fills empty days and separates new from returning', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  assert.equal(s.daily.length, 30)
  const day = Object.fromEntries(s.daily.map((d) => [d.day, d]))
  assert.equal(day['2026-10-28'].visitors, 2)
  assert.equal(day['2026-10-28'].newVisitors, 1) // D is new; C is returning
  assert.equal(day['2026-10-22'].visitors, 0)
  assert.equal(day['2026-10-20'].newVisitors, 1)
  assert.equal(day['2026-10-25'].sessions, 2)
})

test("stats: time-of-day patterns use each visitor's local time", async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  // A's first session_done was 09:30 UTC = 15:00 in IST (+330) on a Tuesday (isodow 2)
  assert.ok(s.patterns.session_done.some((r) => r.hour === 15 && r.dow === 2))
})

test('stats: engagement, quiz scores, time to first plan, audience and errors', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  assert.equal(s.quizzes[0].topic, 'coding')
  assert.equal(s.quizzes[0].avgScore, 80)
  assert.equal(s.engagement.medianMinutesToFirstPlan, 17.5) // A took 5 minutes, C took 30
  assert.equal(s.engagement.sessionsDonePerPlanner.eightPlus, 0)
  assert.equal(s.engagement.sessionsDonePerPlanner.fourToSeven, 1) // A did 4
  assert.equal(s.engagement.sessionsDonePerPlanner.one, 1) // C did 1
  assert.equal(s.engagement.avgMinutesPerVisit, 10)
  const country = Object.fromEntries(s.audience.country.map((r) => [r.value, r.n]))
  assert.deepEqual(country, { IN: 3, US: 1 })
  assert.equal(s.audience.device.find((r) => r.value === 'desktop').n, 1)
  assert.equal(s.errors[0].msg, 'Cannot read properties of undefined')
})

test('stats: a shorter window excludes older activity', async () => {
  const db = await freshDb()
  await seed(db)
  const s = await computeStats(db, { days: 3, tz: 'UTC', now: NOW })
  assert.equal(s.totals.visitors, 3) // B, C, D
  assert.equal(s.daily.length, 3)
})

test('stats: time zones decide what "today" is, and bad ones fall back to UTC', async () => {
  const db = await freshDb()
  await seed(db)
  assert.equal(await safeTimeZone(db, 'Asia/Kolkata'), 'Asia/Kolkata')
  assert.equal(await safeTimeZone(db, 'Not/AZone'), 'UTC')
  assert.equal(await safeTimeZone(db, "'; DROP TABLE events;--"), 'UTC')
  const s = await computeStats(db, { days: 7, tz: "'; DROP TABLE events;--", now: NOW })
  assert.equal(s.tz, 'UTC')
  assert.equal((await count(db)) > 0, true)
})

test('stats: an empty database returns zeros, not errors', async () => {
  const db = await freshDb()
  const s = await computeStats(db, { days: 30, tz: 'UTC', now: NOW })
  assert.equal(s.totals.visitors, 0)
  assert.equal(s.totals.stickiness, null)
  assert.equal(s.retention.day1.rate, null)
  assert.equal(s.engagement.medianMinutesToFirstPlan, null)
  assert.equal(s.daily.length, 30)
})

// ── the stats endpoint is private ──

test('the stats endpoint requires the admin token', async () => {
  const db = await freshDb()
  await seed(db)
  const env = { ANALYTICS_ADMIN_TOKEN: 'correct-horse-battery-staple-123' }
  const handler = createStatsHandler({ getDb: () => db, env, now: () => NOW })
  const req = (headers) => ({ method: 'GET', url: '/api/hu/stats?days=30&tz=UTC', headers })

  const none = mockRes()
  await handler(req({}), none)
  assert.equal(none.statusCode, 401)
  assert.equal(none.body.visitors, undefined)

  const wrong = mockRes()
  await handler(req({ authorization: 'Bearer nope' }), wrong)
  assert.equal(wrong.statusCode, 401)

  const asQuery = mockRes() // the token in a URL is not accepted
  await handler({ method: 'GET', url: '/api/hu/stats?token=correct-horse-battery-staple-123', headers: {} }, asQuery)
  assert.equal(asQuery.statusCode, 401)

  const ok = mockRes()
  await handler(req({ authorization: 'Bearer correct-horse-battery-staple-123' }), ok)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.totals.visitors, 4)
  assert.equal(ok.headers['cache-control'], 'no-store')
  assert.equal(ok.headers['x-robots-tag'], 'noindex')
})

test('the stats endpoint refuses to run without a configured token or database', async () => {
  const noToken = createStatsHandler({ getDb: () => null, env: {} })
  const r1 = mockRes()
  await noToken({ method: 'GET', url: '/x', headers: { authorization: 'Bearer anything' } }, r1)
  assert.equal(r1.statusCode, 503)

  const noDb = createStatsHandler({ getDb: () => null, env: { ANALYTICS_ADMIN_TOKEN: 'tok' } })
  const r2 = mockRes()
  await noDb({ method: 'GET', url: '/x', headers: { authorization: 'Bearer tok' } }, r2)
  assert.equal(r2.statusCode, 503)

  assert.equal(tokenMatches('', 'tok'), false)
  assert.equal(tokenMatches('tok', ''), false)
  assert.equal(tokenMatches('tok', 'tok'), true)
})
