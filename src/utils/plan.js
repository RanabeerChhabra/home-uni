// Turns a list of resources into a dated, finishable study plan.
//
// 1. Units   - every resource becomes one or more units. A video longer than a
//              session is split into parts that each fit (with a deep link to
//              where that part starts), so nothing is impossible to finish.
// 2. Sessions - units are packed into sessions of roughly the person's chosen
//              length (short items share a session; long videos get their own).
// 3. Layout  - sessions are placed on days, starting on a fixed start date.

import { addDays, diffDays, sameDay, startOfDay, startOfWeek, toKey } from './dates.js'
import { enrich } from './resources.js'

// A session may run this much over its target before we split or close it.
export const SLACK = 1.15
// Close a session once it is this full.
const FULL = 0.85
const MAX_WEEKS = 260

// Which weekdays (0 = Mon) to study on for each weekly frequency.
export const ACTIVE_DAYS = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
}

export function activeDays(daysPerWeek) {
  const n = Math.min(7, Math.max(1, Math.round(daysPerWeek)))
  return ACTIVE_DAYS[n]
}

export function unitId(itemId, part) {
  return `${itemId}~${part}`
}

export function makeUnits(items, capacity) {
  const units = []
  for (const item of items) {
    const splittable = Boolean(item.ytId && item.durationSec)
    if (splittable && item.minutes > capacity * SLACK) {
      const parts = Math.ceil(item.minutes / capacity)
      const partSec = Math.ceil(item.durationSec / parts)
      for (let p = 1; p <= parts; p++) {
        const startSec = (p - 1) * partSec
        const endSec = Math.min(item.durationSec, p * partSec)
        units.push({
          id: unitId(item.id, p),
          itemId: item.id,
          part: p,
          parts,
          startSec,
          endSec,
          minutes: Math.max(1, Math.round((endSec - startSec) / 60)),
        })
      }
    } else {
      units.push({
        id: unitId(item.id, 1),
        itemId: item.id,
        part: 1,
        parts: 1,
        startSec: null,
        endSec: null,
        minutes: item.minutes,
      })
    }
  }
  return units
}

export function packSessions(units, capacity) {
  const sessions = []
  let current = null

  const close = () => {
    if (current && current.units.length) {
      sessions.push({ id: current.units[0].id, units: current.units, minutes: current.minutes })
    }
    current = null
  }

  for (const unit of units) {
    // Parts of a split video always stand alone.
    if (unit.parts > 1) {
      close()
      sessions.push({ id: unit.id, units: [unit], minutes: unit.minutes })
      continue
    }
    if (current && current.minutes + unit.minutes > capacity * SLACK) close()
    if (!current) current = { units: [], minutes: 0 }
    current.units.push(unit)
    current.minutes += unit.minutes
    if (current.minutes >= capacity * FULL) close()
  }
  close()
  return sessions
}

// Places sessions on calendar days. The very first session lands on the start
// day itself so people can begin right away; the rest follow the weekly pattern.
export function layoutSessions(sessions, daysPerWeek, startDate) {
  const active = activeDays(daysPerWeek)
  const start = startOfDay(startDate)
  const weekStart = startOfWeek(start)
  const weeks = []
  const placed = []
  let next = 0

  for (let w = 0; next < sessions.length && w < MAX_WEEKS; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, w * 7 + d)
      const beforeStart = diffDays(date, start) < 0
      const isStartDay = sameDay(date, start)
      const open = !beforeStart && (active.includes(d) || isStartDay)
      let session = null
      if (open && next < sessions.length) {
        session = { ...sessions[next++], date, dateKey: toKey(date), week: w + 1 }
        placed.push(session)
      }
      days.push({ date, key: toKey(date), beforeStart, session })
    }
    weeks.push({ number: w + 1, days })
  }
  return { weeks, sessions: placed }
}

export function buildPlan({ items, capacity, daysPerWeek, startDate, archived = new Set(), meta = {} }) {
  const enriched = items.map((i) => enrich(i, meta))
  const allUnits = makeUnits(enriched, capacity)
  const units = allUnits.filter((u) => !archived.has(u.id))
  const packed = packSessions(units, capacity)
  const { weeks, sessions } = layoutSessions(packed, daysPerWeek, startDate)

  const unitsByItem = new Map()
  for (const u of allUnits) {
    if (!unitsByItem.has(u.itemId)) unitsByItem.set(u.itemId, [])
    unitsByItem.get(u.itemId).push(u)
  }

  return {
    items: enriched,
    itemsById: new Map(enriched.map((i) => [i.id, i])),
    allUnits,
    unitsByItem,
    sessions,
    weeks,
    totalMinutes: allUnits.reduce((s, u) => s + u.minutes, 0),
    remainingMinutes: units.reduce((s, u) => s + u.minutes, 0),
    endDate: sessions.length ? sessions[sessions.length - 1].date : null,
  }
}

export function isSessionDone(session, doneSet) {
  return session.units.every((u) => doneSet.has(u.id))
}

export function progress(plan, doneSet) {
  let doneUnits = 0
  let doneMinutes = 0
  for (const u of plan.allUnits) {
    if (doneSet.has(u.id)) {
      doneUnits++
      doneMinutes += u.minutes
    }
  }
  return {
    doneUnits,
    totalUnits: plan.allUnits.length,
    doneMinutes,
    totalMinutes: plan.totalMinutes,
    // Weighted by time, so finishing a 3-hour part counts for more than a 5-minute clip.
    fraction: plan.totalMinutes ? doneMinutes / plan.totalMinutes : 0,
  }
}

export function overdueSessions(plan, doneSet, today) {
  const t = startOfDay(today)
  return plan.sessions.filter((s) => diffDays(s.date, t) < 0 && !isSessionDone(s, doneSet))
}

// Today's session if there is one, else the next one that isn't finished.
export function upNext(plan, doneSet, today) {
  const t = startOfDay(today)
  const todays = plan.sessions.find((s) => sameDay(s.date, t))
  if (todays) return { kind: isSessionDone(todays, doneSet) ? 'doneToday' : 'today', session: todays }
  const later = plan.sessions.find((s) => diffDays(s.date, t) > 0 && !isSessionDone(s, doneSet))
  return later ? { kind: 'later', session: later } : { kind: 'none', session: null }
}

// Two-week checkpoints. A resource belongs to the block where its last part
// is scheduled, so the quiz comes after you've finished it.
export function quizBlocks(plan) {
  const lastWeek = new Map()
  for (const s of plan.sessions) for (const u of s.units) lastWeek.set(u.itemId, s.week)

  const byBlock = new Map()
  for (const [itemId, week] of lastWeek) {
    const b = Math.ceil(week / 2)
    if (!byBlock.has(b)) byBlock.set(b, [])
    byBlock.get(b).push(itemId)
  }

  const order = new Map(plan.items.map((i, idx) => [i.id, idx]))
  return [...byBlock.keys()]
    .sort((a, b) => a - b)
    .map((b) => {
      const itemIds = byBlock.get(b).sort((x, y) => order.get(x) - order.get(y))
      const lastWeekNumber = Math.min(b * 2, plan.weeks.length)
      return {
        index: b,
        id: `quiz:${itemIds.join(',')}`,
        itemIds,
        weekStart: b * 2 - 1,
        weekEnd: lastWeekNumber,
        afterWeek: lastWeekNumber,
      }
    })
}
