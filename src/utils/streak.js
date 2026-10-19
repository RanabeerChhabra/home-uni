export const POINTS_PER_ITEM = 10

function toDateKey(date) {
  return date.toISOString().slice(0, 10)
}

// Called whenever the user completes at least one item on a given calendar
// day. Grows the streak once per day: +1 if the last active day was
// yesterday, resets to 1 if there's a gap, no-op if already counted today.
export function recordActivity(streak, now = new Date()) {
  const todayKey = toDateKey(now)
  if (streak.lastActiveDate === todayKey) {
    return streak
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayKey = toDateKey(yesterday)

  const nextCurrent = streak.lastActiveDate === yesterdayKey ? streak.current + 1 : 1

  return {
    current: nextCurrent,
    longest: Math.max(streak.longest, nextCurrent),
    lastActiveDate: todayKey,
  }
}

export function initialStreak() {
  return { current: 0, longest: 0, lastActiveDate: null }
}
