import { CURRICULUM } from '../data/curriculum.js'
import { initialStreak } from './streak.js'

const KEY = 'homeuni:v2'
const LEGACY_KEYS = ['ascend:v1']

function isValidProfile(p) {
  return (
    p &&
    typeof p.topic === 'string' &&
    typeof p.level === 'string' &&
    CURRICULUM[p.topic]?.[p.level] &&
    Array.isArray(p.focus) &&
    typeof p.startDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) &&
    Number.isFinite(p.daysPerWeek) &&
    Number.isFinite(p.sessionMinutes)
  )
}

export function loadState() {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k)
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!isValidProfile(s.profile)) return null
    return {
      profile: { goal: '', reasons: [], format: 'mix', archived: [], ...s.profile },
      done: Array.isArray(s.done) ? s.done : [],
      streak: s.streak && typeof s.streak.current === 'number' ? s.streak : initialStreak(),
      quizResults: s.quizResults && typeof s.quizResults === 'object' ? s.quizResults : {},
    }
  } catch {
    return null
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked: progress just won't persist this session.
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
