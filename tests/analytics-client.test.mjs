import test from 'node:test'
import assert from 'node:assert/strict'
import { createTracker, trackingAllowed, deviceClass, referrerHost } from '../src/utils/analytics.js'

const fakeStorage = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  }
}

function setup(overrides = {}) {
  const storage = overrides.storage ?? fakeStorage()
  const session = overrides.session ?? fakeStorage()
  const sent = []
  let clock = overrides.clock ?? 1_000_000
  const timers = []
  const tracker = createTracker({
    storage,
    session,
    nav: overrides.nav ?? {},
    production: overrides.production ?? true,
    transport: overrides.transport ?? ((body, opts) => sent.push({ body, opts })),
    now: () => clock,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => {},
    context: () => ({ dev: 'mobile', tzo: 330 }),
  })
  return { tracker, storage, session, sent, timers, advance: (ms) => (clock += ms), now: () => clock }
}

test('tracking is off outside production, for automation, DNT, GPC and opted-out visitors', () => {
  assert.deepEqual(trackingAllowed({ production: false }), { allowed: false, reason: 'not_production' })
  assert.equal(trackingAllowed({ production: true, nav: { webdriver: true } }).reason, 'automation')
  assert.equal(trackingAllowed({ production: true, nav: { doNotTrack: '1' } }).reason, 'do_not_track')
  assert.equal(trackingAllowed({ production: true, nav: { doNotTrack: 'yes' } }).reason, 'do_not_track')
  assert.equal(
    trackingAllowed({ production: true, nav: { globalPrivacyControl: true } }).reason,
    'global_privacy_control',
  )
  const storage = fakeStorage()
  storage.setItem('homeuni:optout', '1')
  assert.equal(trackingAllowed({ production: true, storage }).reason, 'opted_out')
  assert.equal(trackingAllowed({ production: true, nav: { doNotTrack: '0' }, storage: fakeStorage() }).allowed, true)
})

test('nothing is stored or sent when tracking is not allowed', () => {
  for (const nav of [{ doNotTrack: '1' }, { webdriver: true }, { globalPrivacyControl: true }]) {
    const { tracker, sent, storage, timers } = setup({ nav })
    tracker.start({ hasPlan: false })
    tracker.track('new_plan')
    tracker.flush()
    assert.equal(sent.length, 0)
    assert.equal(storage._m.size, 0, 'no ids written')
    assert.equal(timers.length, 0)
  }
  const dev = setup({ production: false })
  dev.tracker.start({})
  dev.tracker.track('new_plan')
  dev.tracker.flush()
  assert.equal(dev.sent.length, 0)
})

test('first visit creates a random id and reports a new visitor', () => {
  const { tracker, sent, storage } = setup()
  tracker.start({ hasPlan: false, lang: 'en-IN', referrer: 'https://twitter.com/x', ownHost: 'rana.beer' })
  tracker.flush()
  assert.equal(sent.length, 1)
  const { body } = sent[0]
  assert.match(body.vid, /^[A-Za-z0-9-]{8,64}$/)
  assert.match(body.sid, /^[A-Za-z0-9-]{8,64}$/)
  assert.deepEqual(body.ctx, { dev: 'mobile', tzo: 330 })
  assert.equal(body.events[0].n, 'app_open')
  assert.deepEqual(body.events[0].p, {
    returning: false,
    visit: 1,
    days_since_first: 0,
    has_plan: false,
    ref: 'twitter.com',
    lang: 'en',
  })
  assert.equal(storage.getItem('homeuni:vid'), body.vid)
})

test('a returning visitor keeps the same id and the visit count grows', () => {
  const storage = fakeStorage()
  const a = setup({ storage, clock: 1_000_000 })
  a.tracker.start({})
  a.tracker.flush()
  const second = setup({ storage, clock: 1_000_000 + 3 * 86_400_000 })
  second.tracker.start({ hasPlan: true })
  second.tracker.flush()
  assert.equal(second.sent[0].body.vid, a.sent[0].body.vid)
  const p = second.sent[0].body.events[0].p
  assert.equal(p.returning, true)
  assert.equal(p.visit, 2)
  assert.equal(p.days_since_first, 3)
  assert.equal(p.has_plan, true)
})

test('events are batched: sent on a timer, or immediately once enough are queued', () => {
  const { tracker, sent, timers } = setup()
  tracker.start({})
  tracker.track('new_plan')
  assert.equal(sent.length, 0)
  assert.equal(timers.length, 1)
  timers[0].fn()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].body.events.length, 2)

  for (let i = 0; i < 12; i++) tracker.track('visible_time', { s: 1 })
  assert.equal(sent.length, 2) // flushed by size without waiting
})

test('event times are sent as ages, so the server can place them accurately', () => {
  const { tracker, sent, advance } = setup()
  tracker.start({})
  advance(2500)
  tracker.track('new_plan')
  advance(500)
  tracker.flush()
  assert.deepEqual(
    sent[0].body.events.map((e) => e.dt),
    [3000, 500],
  )
})

test('beacon sends are flagged for page-hide flushes', () => {
  const { tracker, sent } = setup()
  tracker.start({})
  tracker.flush({ beacon: true })
  assert.equal(sent[0].opts.beacon, true)
})

test('a transport failure never reaches the app', () => {
  const { tracker } = setup({
    transport: () => {
      throw new Error('network down')
    },
  })
  tracker.start({})
  assert.doesNotThrow(() => tracker.flush())
  assert.doesNotThrow(() => tracker.track('new_plan'))
})

test('opting out deletes the stored id, asks the server to forget it, and stops all tracking', async () => {
  const { tracker, sent, storage } = setup()
  tracker.start({})
  tracker.flush()
  const vid = sent[0].body.vid
  const forgotten = []
  await tracker.optOut(async (id) => forgotten.push(id))
  assert.deepEqual(forgotten, [vid])
  assert.equal(storage.getItem('homeuni:vid'), null)
  assert.equal(tracker.optedOut(), true)
  tracker.track('new_plan')
  tracker.flush()
  assert.equal(sent.length, 1, 'nothing sent after opt-out')
  tracker.optIn()
  assert.equal(tracker.optedOut(), false)
})

test('opting out discards anything still queued', async () => {
  const { tracker, sent } = setup()
  tracker.start({})
  tracker.track('new_plan')
  await tracker.optOut(async () => {})
  tracker.flush()
  assert.equal(sent.length, 0)
})

test('errors are capped per session and the queue cannot grow without bound', () => {
  const { tracker, sent } = setup()
  tracker.start({})
  for (let i = 0; i < 20; i++) tracker.trackError(`boom ${i}`, 'window')
  tracker.flush()
  assert.equal(sent[0].body.events.filter((e) => e.n === 'js_error').length, 5)

  const big = setup()
  big.tracker.start({})
  for (let i = 0; i < 500; i++) big.tracker.track('visible_time', { s: 1 })
  big.tracker.flush()
  const total = big.sent.reduce((n, s) => n + s.body.events.length, 0)
  assert.ok(total <= 600)
})

test('helpers', () => {
  assert.equal(deviceClass(390), 'mobile')
  assert.equal(deviceClass(800), 'tablet')
  assert.equal(deviceClass(1440), 'desktop')
  assert.equal(referrerHost('https://news.ycombinator.com/item?id=1', 'rana.beer'), 'news.ycombinator.com')
  assert.equal(referrerHost('https://rana.beer/x', 'rana.beer'), undefined)
  assert.equal(referrerHost('', 'rana.beer'), undefined)
  assert.equal(referrerHost('not a url', 'rana.beer'), undefined)
})
