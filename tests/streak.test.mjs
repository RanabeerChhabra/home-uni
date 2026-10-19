import test from 'node:test'
import assert from 'node:assert/strict'
import { initialStreak, recordActivity, activeStreak, practicedToday } from '../src/utils/streak.js'

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h)

test('first activity starts a streak of 1', () => {
  const s = recordActivity(initialStreak(), at(2026, 10, 19))
  assert.equal(s.current, 1)
  assert.equal(s.longest, 1)
})

test('same day does not double count', () => {
  let s = recordActivity(initialStreak(), at(2026, 10, 19, 9))
  s = recordActivity(s, at(2026, 10, 19, 21))
  assert.equal(s.current, 1)
})

test('consecutive days grow the streak, a gap resets it', () => {
  let s = recordActivity(initialStreak(), at(2026, 10, 19))
  s = recordActivity(s, at(2026, 10, 20))
  s = recordActivity(s, at(2026, 10, 21))
  assert.equal(s.current, 3)
  s = recordActivity(s, at(2026, 10, 24))
  assert.equal(s.current, 1)
  assert.equal(s.longest, 3)
})

test('late-night activity counts for the local day (not UTC)', () => {
  // 23:30 local would already be "tomorrow" in UTC for timezones behind UTC
  let s = recordActivity(initialStreak(), at(2026, 10, 19, 23))
  s = recordActivity(s, at(2026, 10, 20, 0))
  assert.equal(s.current, 2)
})

test('an old streak is not shown as active', () => {
  const s = recordActivity(initialStreak(), at(2026, 10, 19))
  assert.equal(activeStreak(s, at(2026, 10, 20)), 1) // yesterday still counts
  assert.equal(activeStreak(s, at(2026, 10, 22)), 0) // missed days: streak is over
  assert.equal(practicedToday(s, at(2026, 10, 19)), true)
  assert.equal(practicedToday(s, at(2026, 10, 20)), false)
})
