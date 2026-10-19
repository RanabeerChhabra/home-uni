// Converts JS's Date.getDay() (0=Sun..6=Sat) into a Mon-first index (0=Mon..6=Sun).
function toMondayFirst(jsDay) {
  return (jsDay + 6) % 7
}

// Picks which weekdays (Mon-first indices) to use for a given weekly frequency,
// spread as evenly as possible across the 7-day week. E.g. 3/week -> Mon/Wed/Fri.
export function evenlySpreadDays(daysPerWeek) {
  const n = Math.min(7, Math.max(1, daysPerWeek))
  const indices = new Set()
  for (let i = 0; i < n; i++) {
    indices.add(Math.floor((i * 7) / n))
  }
  return [...indices].sort((a, b) => a - b)
}

// Lays curriculum items out one-per-active-day, starting from `startDate`,
// across as many weeks as it takes to place every item. Returns an array of
// weeks, each holding all 7 days (Mon-Sun) so the UI can render rest days too.
export function buildSchedule(items, daysPerWeek, startDate = new Date()) {
  const activeDays = evenlySpreadDays(daysPerWeek)

  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)

  const weekStart = new Date(start)
  weekStart.setDate(start.getDate() - toMondayFirst(start.getDay()))

  const weeks = []
  let itemIndex = 0
  let weekOffset = 0

  while (itemIndex < items.length && weekOffset < 104) {
    const weekMonday = new Date(weekStart)
    weekMonday.setDate(weekStart.getDate() + weekOffset * 7)

    const days = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekMonday)
      date.setDate(weekMonday.getDate() + d)

      const dayItems = []
      const isActiveDay = activeDays.includes(d)
      const isOnOrAfterStart = date >= start
      if (isActiveDay && isOnOrAfterStart && itemIndex < items.length) {
        dayItems.push(items[itemIndex])
        itemIndex++
      }
      days.push({ date, items: dayItems })
    }

    weeks.push({ weekNumber: weekOffset + 1, days })
    weekOffset++
  }

  return weeks
}
