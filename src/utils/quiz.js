// Builds checkpoint quizzes from the question bank.

export const POINTS_PER_CORRECT = 10
export const MAX_QUESTIONS = 5

// Small deterministic PRNG so a question's option order is stable per attempt.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function buildQuestion(id, entry, attempt = 0) {
  const [prompt, correct, wrong, why] = entry
  const rand = mulberry32(hash(`${id}:${attempt}`))
  const options = [correct, ...wrong]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { id, prompt, options, answerIndex: options.indexOf(correct), why }
}

// Spread a pick across the list instead of just taking the first few.
function evenlySpaced(list, n) {
  if (list.length <= n) return list
  const out = []
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)])
  return out
}

/**
 * Quiz status for one two-week block.
 * Questions come only from resources the person has fully finished, so a quiz
 * never tests something they haven't watched yet.
 */
export function quizStatus(block, plan, doneSet, bank) {
  const finished = block.itemIds.filter((itemId) => {
    const units = plan.unitsByItem.get(itemId) ?? []
    return units.length > 0 && units.every((u) => doneSet.has(u.id))
  })
  const withQuestions = finished.filter((id) => bank[id])
  const needed = Math.min(2, block.itemIds.length)
  const ids = evenlySpaced(withQuestions, MAX_QUESTIONS)
  return {
    unlocked: withQuestions.length >= needed && ids.length > 0,
    questionIds: ids,
    finishedCount: finished.length,
    needed,
    totalItems: block.itemIds.length,
  }
}

export function buildQuiz(questionIds, bank, attempt = 0) {
  return questionIds.map((id) => buildQuestion(id, bank[id], attempt))
}
