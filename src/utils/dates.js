// Local-calendar date helpers. Everything here works in the user's own timezone
// (never UTC), so "today" and streaks match what the person sees on their clock.

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
}

// "2026-10-19" in local time.
export function toKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 0 = Monday … 6 = Sunday
export function mondayIndex(date) {
  return (date.getDay() + 6) % 7
}

export function startOfWeek(date) {
  return addDays(startOfDay(date), -mondayIndex(date))
}

// Whole calendar days from b to a (a - b), DST-safe.
export function diffDays(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcA - utcB) / 86400000)
}

export function sameDay(a, b) {
  return diffDays(a, b) === 0
}
