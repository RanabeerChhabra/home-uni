// Picks the resources that fit what someone said they want out of a topic.

import { FOCUS_AREAS } from '../data/curriculum.js'
import { TAGS } from '../data/tags.js'

export const MIN_ITEMS = 6

export function tagsOf(id) {
  const parts = (TAGS[id] ?? '').split(' ').filter(Boolean)
  return { tags: parts.filter((t) => t !== 'core'), core: parts.includes('core') }
}

// Only offer focus areas that have enough material at this level.
export function availableFocusAreas(topicId, items) {
  return (FOCUS_AREAS[topicId] ?? [])
    .map((area) => ({ ...area, count: items.filter((i) => tagsOf(i.id).tags.includes(area.id)).length }))
    .filter((area) => area.count >= 2)
}

// Which of the person's chosen focus areas does this item serve?
export function matchedFocus(itemId, focus) {
  const { tags } = tagsOf(itemId)
  return focus.filter((f) => tags.includes(f))
}

/**
 * @param items   curriculum entries for one topic + level, in teaching order
 * @param opts.focus   chosen focus-area ids (empty = no preference, keep everything)
 * @param opts.format  'mix' | 'videos' | 'reading'
 * @param opts.minutesOf  (item) => minutes, used to judge "long" videos
 */
export function tailorItems(items, { focus = [], format = 'mix', minutesOf = (i) => i.estMinutes } = {}) {
  const info = new Map(items.map((i) => [i.id, tagsOf(i.id)]))
  const matches = (i) => info.get(i.id).tags.some((t) => focus.includes(t))
  const isCore = (i) => info.get(i.id).core

  let picked = focus.length ? items.filter((i) => isCore(i) || matches(i)) : items.slice()

  if (format === 'videos') {
    picked = picked.filter((i) => i.type === 'video' || isCore(i))
  } else if (format === 'reading') {
    picked = picked.filter((i) => i.type === 'article' || isCore(i) || minutesOf(i) <= 20)
  }

  // Never hand someone a tiny plan: backfill with the next most relevant items.
  if (picked.length < MIN_ITEMS) {
    const have = new Set(picked.map((i) => i.id))
    const rest = items
      .filter((i) => !have.has(i.id) && info.get(i.id).tags.length > 0)
      .sort((a, b) => Number(matches(b)) - Number(matches(a)))
    for (const i of rest) {
      if (picked.length >= MIN_ITEMS) break
      picked.push(i)
    }
  }

  // Keep the curated teaching order, but when someone has a focus, lead with the
  // resources that serve it and follow with the essential background.
  const order = new Map(items.map((i, idx) => [i.id, idx]))
  const rank = (i) => (focus.length && !matches(i) ? 1 : 0)
  return picked.sort((a, b) => rank(a) - rank(b) || order.get(a.id) - order.get(b.id))
}
