import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CURRICULUM, FOCUS_AREAS, TOPICS, LEVELS } from '../src/data/curriculum.js'
import { TAGS } from '../src/data/tags.js'
import { QUIZ_BANK } from '../src/data/quizzes.js'
import { tailorItems, availableFocusAreas, tagsOf, MIN_ITEMS } from '../src/utils/tailor.js'
import { buildQuiz, buildQuestion, quizStatus } from '../src/utils/quiz.js'
import { buildPlan, quizBlocks } from '../src/utils/plan.js'
import { youtubeId } from '../src/utils/resources.js'
import { fromKey } from '../src/utils/dates.js'

const meta = JSON.parse(readFileSync(new URL('../src/data/videoMeta.json', import.meta.url), 'utf8'))
const all = []
for (const [topic, levels] of Object.entries(CURRICULUM))
  for (const [level, items] of Object.entries(levels)) for (const item of items) all.push({ topic, level, item })

test('every topic offers all three levels', () => {
  for (const t of TOPICS) for (const l of LEVELS) assert.ok(CURRICULUM[t.id]?.[l]?.length >= 6, `${t.id}/${l}`)
})

test('resource ids are unique and urls are unique', () => {
  const ids = all.map((a) => a.item.id)
  assert.equal(new Set(ids).size, ids.length)
  const urls = all.map((a) => a.item.url)
  assert.equal(new Set(urls).size, urls.length)
})

test('every resource is well-formed', () => {
  for (const { item } of all) {
    assert.ok(item.title && item.description, item.id)
    assert.ok(['video', 'article'].includes(item.type), item.id)
    assert.ok(item.url.startsWith('https://'), item.id)
    assert.ok(item.estMinutes > 0, item.id)
    assert.ok(!item.url.includes('m.youtube.com'), item.id)
    assert.ok(!item.url.includes('/playlist'), `${item.id} is a playlist`)
  }
})

test('every video has verified metadata and a real audience', () => {
  for (const { item } of all) {
    const id = youtubeId(item.url)
    if (!id) continue
    const m = meta[id]
    assert.ok(m, `${item.id} (${id}) missing from videoMeta.json — run scripts/verify-links.mjs`)
    assert.ok(m.durationSec > 0, item.id)
    assert.ok(m.views >= 90000, `${item.id} has only ${m.views} views`)
  }
})

test('YouTube links are typed as videos', () => {
  for (const { item } of all) if (youtubeId(item.url)) assert.equal(item.type, 'video', item.id)
})

test('every resource has tags that belong to its topic, and a quiz question', () => {
  for (const { topic, item } of all) {
    assert.ok(item.id in TAGS, `${item.id} missing tags`)
    const valid = new Set(FOCUS_AREAS[topic].map((a) => a.id))
    for (const t of tagsOf(item.id).tags) assert.ok(valid.has(t), `${item.id} has unknown tag ${t}`)
    assert.ok(QUIZ_BANK[item.id], `${item.id} missing quiz question`)
  }
  const ids = new Set(all.map((a) => a.item.id))
  for (const id of Object.keys(TAGS)) assert.ok(ids.has(id), `stray tag ${id}`)
  for (const id of Object.keys(QUIZ_BANK)) assert.ok(ids.has(id), `stray quiz ${id}`)
})

test('quiz entries are valid', () => {
  for (const [id, [q, correct, wrong, why]] of Object.entries(QUIZ_BANK)) {
    assert.ok(q.endsWith('?') || q.endsWith('…'), `${id} prompt`)
    assert.equal(wrong.length, 3, `${id} needs 3 wrong answers`)
    const opts = [correct, ...wrong]
    assert.equal(new Set(opts).size, 4, `${id} has duplicate options`)
    assert.ok(why.length > 5, `${id} explanation`)
  }
})

test('option order is shuffled but deterministic, and the answer index is right', () => {
  const positions = new Set()
  for (const id of Object.keys(QUIZ_BANK)) {
    const a = buildQuestion(id, QUIZ_BANK[id], 0)
    const b = buildQuestion(id, QUIZ_BANK[id], 0)
    assert.deepEqual(a.options, b.options)
    assert.equal(a.options[a.answerIndex], QUIZ_BANK[id][1])
    positions.add(a.answerIndex)
  }
  assert.equal(positions.size, 4, 'correct answers should land in every position')
})

test('every focus area on offer has enough material, and some exist at every level', () => {
  for (const t of TOPICS)
    for (const l of LEVELS) {
      const items = CURRICULUM[t.id][l]
      const areas = availableFocusAreas(t.id, items)
      assert.ok(areas.length >= 2, `${t.id}/${l} offers only ${areas.length} focus areas`)
    }
})

test('tailoring never returns a tiny plan and always keeps core items', () => {
  for (const t of TOPICS)
    for (const l of LEVELS) {
      const items = CURRICULUM[t.id][l]
      const areas = availableFocusAreas(t.id, items)
      for (const format of ['mix', 'videos', 'reading']) {
        for (const focus of [[], ...areas.map((a) => [a.id]), areas.slice(0, 2).map((a) => a.id)]) {
          const out = tailorItems(items, { focus, format })
          assert.ok(out.length >= MIN_ITEMS, `${t.id}/${l} ${format} [${focus}] -> ${out.length}`)
          const order = items.map((i) => i.id)
          const idx = (i) => order.indexOf(i.id)
          if (!focus.length) {
            assert.deepEqual(
              out.map(idx),
              out.map(idx).sort((a, b) => a - b),
              'keeps teaching order',
            )
          } else {
            // focus-matching resources lead; each group keeps teaching order
            const isMatch = (i) => tagsOf(i.id).tags.some((x) => focus.includes(x))
            const firstBackground = out.findIndex((i) => !isMatch(i))
            if (firstBackground >= 0)
              assert.ok(
                out.slice(firstBackground).every((i) => !isMatch(i)),
                'focus items come first',
              )
            const lead = out.filter(isMatch).map(idx)
            assert.deepEqual(
              lead,
              [...lead].sort((a, b) => a - b),
            )
          }
          if (focus.length && format === 'mix') {
            for (const core of items.filter((i) => tagsOf(i.id).core))
              assert.ok(out.includes(core), `${core.id} (core) dropped`)
          }
        }
      }
    }
})

test('focusing narrows the plan', () => {
  const items = CURRICULUM.finance.Intermediate
  const all = tailorItems(items, { focus: [] })
  const valuation = tailorItems(items, { focus: ['valuation'] })
  assert.equal(all.length, items.length)
  assert.ok(valuation.length < all.length)
  assert.ok(valuation.some((i) => i.id === 'fin-i-3'))
})

test('videos-only format drops non-core articles', () => {
  const items = CURRICULUM.finance.Beginner
  const out = tailorItems(items, { focus: ['money'], format: 'videos' })
  for (const i of out) assert.ok(i.type === 'video' || tagsOf(i.id).core)
})

test('every topic/level plans end to end, and long videos are split to fit', () => {
  for (const t of TOPICS)
    for (const l of LEVELS) {
      for (const capacity of [15, 30, 60]) {
        const items = tailorItems(CURRICULUM[t.id][l], { focus: [] })
        const plan = buildPlan({ items, capacity, daysPerWeek: 3, startDate: fromKey('2026-10-19'), meta })
        assert.ok(plan.sessions.length > 0)
        for (const s of plan.sessions) {
          const single = s.units.length === 1
          assert.ok(single || s.minutes <= capacity * 1.15, `${t.id}/${l}@${capacity} session ${s.id} is ${s.minutes}m`)
          for (const u of s.units)
            if (u.parts > 1) assert.ok(u.minutes <= capacity * 1.2, `${u.id} part is ${u.minutes}m`)
        }
        // every unit is scheduled exactly once
        const placed = plan.sessions.flatMap((s) => s.units.map((u) => u.id)).sort()
        assert.deepEqual(placed, plan.allUnits.map((u) => u.id).sort())
      }
    }
})

test('quizzes unlock only from finished resources and use real questions', () => {
  const items = tailorItems(CURRICULUM.finance.Beginner, { focus: [] })
  const plan = buildPlan({ items, capacity: 30, daysPerWeek: 3, startDate: fromKey('2026-10-19'), meta })
  const blocks = quizBlocks(plan)
  assert.ok(blocks.length >= 2)
  const first = blocks[0]
  assert.equal(quizStatus(first, plan, new Set(), QUIZ_BANK).unlocked, false)
  const done = new Set(first.itemIds.flatMap((id) => plan.unitsByItem.get(id).map((u) => u.id)))
  const status = quizStatus(first, plan, done, QUIZ_BANK)
  assert.equal(status.unlocked, true)
  assert.ok(status.questionIds.length >= 1 && status.questionIds.length <= 5)
  const quiz = buildQuiz(status.questionIds, QUIZ_BANK, 0)
  assert.ok(quiz.every((q) => q.options.length === 4))
})
