import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPlan,
  makeUnits,
  packSessions,
  layoutSessions,
  activeDays,
  quizBlocks,
  overdueSessions,
  upNext,
  isSessionDone,
  progress,
} from '../src/utils/plan.js'
import { enrich, withStart, timestamp, formatViews, formatMinutes } from '../src/utils/resources.js'
import { toKey, fromKey, addDays, diffDays, mondayIndex } from '../src/utils/dates.js'

const video = (id, minutes) => ({
  id,
  title: id,
  type: 'video',
  url: `https://www.youtube.com/watch?v=${id}`,
  description: '',
  estMinutes: minutes,
})
const article = (id, minutes) => ({
  id,
  title: id,
  type: 'article',
  url: `https://example.com/${id}`,
  description: '',
  estMinutes: minutes,
})
const metaFor = (id, minutes, views = 1000) => ({ [id]: { durationSec: minutes * 60, views, channel: 'C' } })

test('a 4-hour video is split into parts that each fit the session length', () => {
  const items = [enrich(video('longvid', 240), metaFor('longvid', 240))]
  const units = makeUnits(items, 30)
  assert.equal(units.length, 8)
  assert.ok(units.every((u) => u.minutes <= 30 * 1.15))
  assert.equal(units[0].startSec, 0)
  assert.equal(units[units.length - 1].endSec, 240 * 60)
  // parts tile the video with no gaps or overlaps
  for (let i = 1; i < units.length; i++) assert.equal(units[i].startSec, units[i - 1].endSec)
  assert.equal(
    units.reduce((s, u) => s + u.minutes, 0),
    240,
  )
})

test('a video that only slightly exceeds the session stays whole', () => {
  const items = [enrich(video('v', 33), metaFor('v', 33))]
  assert.equal(makeUnits(items, 30).length, 1)
})

test('articles are never split, even when long', () => {
  const units = makeUnits([enrich(article('a', 60), {})], 15)
  assert.equal(units.length, 1)
  assert.equal(units[0].startSec, null)
})

test('unit ids are stable for the same item and capacity', () => {
  const items = [enrich(video('x', 100), metaFor('x', 100))]
  assert.deepEqual(
    makeUnits(items, 30).map((u) => u.id),
    makeUnits(items, 30).map((u) => u.id),
  )
})

test('short items share a session; split parts stand alone', () => {
  const items = [
    enrich(article('a', 5), {}),
    enrich(article('b', 5), {}),
    enrich(article('c', 5), {}),
    enrich(video('big', 90), metaFor('big', 90)),
    enrich(article('d', 8), {}),
  ]
  const sessions = packSessions(makeUnits(items, 15), 15)
  assert.deepEqual(
    sessions[0].units.map((u) => u.itemId),
    ['a', 'b', 'c'],
  )
  const bigSessions = sessions.filter((s) => s.units[0].itemId === 'big')
  assert.equal(bigSessions.length, 6)
  assert.ok(bigSessions.every((s) => s.units.length === 1))
})

test('no session wildly exceeds the target', () => {
  const items = Array.from({ length: 20 }, (_, i) => enrich(article(`a${i}`, 7 + (i % 4)), {}))
  const sessions = packSessions(makeUnits(items, 30), 30)
  assert.ok(sessions.every((s) => s.units.length === 1 || s.minutes <= 30 * 1.15))
})

test('weekly patterns', () => {
  assert.deepEqual(activeDays(3), [0, 2, 4])
  assert.deepEqual(activeDays(5), [0, 1, 2, 3, 4])
  assert.equal(activeDays(7).length, 7)
  assert.deepEqual(activeDays(0), activeDays(1))
  assert.deepEqual(activeDays(99), activeDays(7))
})

test('first session starts on the start day even if it is not a study day', () => {
  // 2026-10-20 is a Tuesday; 3x/week studies Mon/Wed/Fri
  const start = fromKey('2026-10-20')
  assert.equal(mondayIndex(start), 1)
  const sessions = packSessions(
    makeUnits(
      Array.from({ length: 4 }, (_, i) => enrich(article(`a${i}`, 30), {})),
      30,
    ),
    30,
  )
  const { sessions: placed } = layoutSessions(sessions, 3, start)
  assert.deepEqual(
    placed.map((s) => s.dateKey),
    ['2026-10-20', '2026-10-21', '2026-10-23', '2026-10-26'],
  )
})

test('layout is anchored to the start date, not to "now"', () => {
  const items = Array.from({ length: 5 }, (_, i) => article(`a${i}`, 30))
  const a = buildPlan({ items, capacity: 30, daysPerWeek: 3, startDate: fromKey('2026-10-19') })
  const b = buildPlan({ items, capacity: 30, daysPerWeek: 3, startDate: fromKey('2026-10-19') })
  assert.deepEqual(
    a.sessions.map((s) => s.dateKey),
    b.sessions.map((s) => s.dateKey),
  )
  assert.equal(a.sessions[0].dateKey, '2026-10-19')
})

test('every week has 7 days and days before the start are flagged', () => {
  const items = Array.from({ length: 3 }, (_, i) => article(`a${i}`, 30))
  const plan = buildPlan({ items, capacity: 30, daysPerWeek: 3, startDate: fromKey('2026-10-22') }) // Thursday
  assert.ok(plan.weeks.every((w) => w.days.length === 7))
  assert.equal(plan.weeks[0].days.filter((d) => d.beforeStart).length, 3)
})

test('replanning skips archived units', () => {
  const items = [video('v', 90)]
  const meta = metaFor('v', 90)
  const full = buildPlan({ items, capacity: 30, daysPerWeek: 7, startDate: fromKey('2026-10-19'), meta })
  assert.equal(full.sessions.length, 3)
  const archived = new Set([full.allUnits[0].id])
  const re = buildPlan({ items, capacity: 30, daysPerWeek: 7, startDate: fromKey('2026-10-25'), archived, meta })
  assert.equal(re.sessions.length, 2)
  assert.equal(re.allUnits.length, 3) // totals still count the archived part
})

test('progress, overdue and up-next', () => {
  const items = Array.from({ length: 4 }, (_, i) => article(`a${i}`, 30))
  const plan = buildPlan({ items, capacity: 30, daysPerWeek: 7, startDate: fromKey('2026-10-19') })
  const done = new Set([plan.sessions[0].units[0].id])
  assert.equal(progress(plan, done).doneUnits, 1)
  assert.equal(progress(plan, done).fraction, 0.25) // 30 of 120 minutes
  const today = fromKey('2026-10-21')
  const overdue = overdueSessions(plan, done, today)
  assert.deepEqual(
    overdue.map((s) => s.dateKey),
    ['2026-10-20'],
  )
  assert.equal(upNext(plan, done, today).kind, 'today')
  assert.ok(isSessionDone(plan.sessions[0], done))
})

test('quiz blocks group resources by the block where their last part lands', () => {
  const items = [video('long', 120), article('a', 30), article('b', 30), article('c', 30), article('d', 30)]
  const plan = buildPlan({
    items,
    capacity: 30,
    daysPerWeek: 2,
    startDate: fromKey('2026-10-19'),
    meta: metaFor('long', 120),
  })
  const blocks = quizBlocks(plan)
  const all = blocks.flatMap((b) => b.itemIds).sort()
  assert.deepEqual(all, ['a', 'b', 'c', 'd', 'long'])
  const longWeek = Math.max(...plan.sessions.filter((s) => s.units[0].itemId === 'long').map((s) => s.week))
  const block = blocks.find((b) => b.itemIds.includes('long'))
  assert.equal(block.index, Math.ceil(longWeek / 2))
})

test('resource helpers', () => {
  assert.equal(withStart('https://www.youtube.com/watch?v=abc', 3725), 'https://www.youtube.com/watch?v=abc&t=3725s')
  assert.equal(withStart('https://example.com/x', 100), 'https://example.com/x')
  assert.equal(timestamp(3725), '1:02:05')
  assert.equal(timestamp(125), '2:05')
  assert.equal(formatViews(21103160), '21.1M views')
  assert.equal(formatViews(4800), '5K views')
  assert.equal(formatMinutes(207), '3h 27m')
  assert.equal(formatMinutes(45), '45 min')
})

test('local dates round-trip and handle DST', () => {
  assert.equal(toKey(fromKey('2026-03-08')), '2026-03-08')
  assert.equal(diffDays(fromKey('2026-03-09'), fromKey('2026-03-07')), 2) // across US DST change
  assert.equal(toKey(addDays(fromKey('2026-10-31'), 1)), '2026-11-01')
})
