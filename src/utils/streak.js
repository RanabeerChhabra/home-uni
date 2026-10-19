import { addDays, toKey } from './dates.js'

export function initialStreak() {
  return { current: 0, longest: 0, lastActiveDate: null }
}

// Call when the person finishes a session. Grows the streak once per local day:
// +1 if they were also active yesterday, otherwise it restarts at 1.
export function recordActivity(streak, now = new Date()) {
  const today = toKey(now)
  if (streak.lastActiveDate === today) return streak
  const yesterday = toKey(addDays(now, -1))
  const current = streak.lastActiveDate === yesterday ? streak.current + 1 : 1
  return { current, longest: Math.max(streak.longest, current), lastActiveDate: today }
}

// What to show. A streak you didn't extend yesterday or today has already ended.
export function activeStreak(streak, now = new Date()) {
  if (!streak.lastActiveDate) return 0
  const today = toKey(now)
  const yesterday = toKey(addDays(now, -1))
  return streak.lastActiveDate === today || streak.lastActiveDate === yesterday ? streak.current : 0
}

// "Practiced today" drives the little flame state.
export function practicedToday(streak, now = new Date()) {
  return streak.lastActiveDate === toKey(now)
}
