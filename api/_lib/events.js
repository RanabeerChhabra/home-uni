// The analytics event contract, and the validation that enforces it.
//
// Privacy by construction: the server only accepts the event names and
// properties listed here, with strict types and sizes. Anything else is
// dropped, so free text (like someone's goal) can never be stored even if a
// client sends it. Nothing here identifies a person: visitors are random ids.

export const MAX_EVENTS_PER_BATCH = 40
export const MAX_BODY_BYTES = 24_000
export const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000

const TOPICS = ['finance', 'business', 'philosophy', 'coding', 'health']
const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const FORMATS = ['videos', 'mix', 'reading']
const STEPS = ['topic', 'level', 'focus', 'goal', 'format', 'pace', 'review']
const TOKEN = /^[A-Za-z0-9_~-]{1,48}$/
const HOST = /^[a-z0-9.-]{1,60}$/i

const t = {
  bool: (v) => (typeof v === 'boolean' ? v : undefined),
  int: (v) => (Number.isFinite(v) ? Math.max(-1_000_000, Math.min(1_000_000, Math.round(v))) : undefined),
  token: (v) => (typeof v === 'string' && TOKEN.test(v) ? v : undefined),
  host: (v) => (typeof v === 'string' && HOST.test(v) ? v.toLowerCase() : undefined),
  oneOf: (values) => (v) => (values.includes(v) ? v : undefined),
  // Short, single-line text with control characters stripped. Only used for error messages.
  text: (max) => (v) =>
    typeof v === 'string'
      ? v
          .replace(/[\u0000-\u001f\u007f]/g, ' ')
          .replace(/https?:\/\/\S+/g, '<url>')
          .trim()
          .slice(0, max) || undefined
      : undefined,
  // A short list of tokens (e.g. focus areas, resource ids).
  tokens: (maxItems) => (v) => {
    if (!Array.isArray(v)) return undefined
    const out = v.filter((x) => typeof x === 'string' && TOKEN.test(x)).slice(0, maxItems)
    return out
  },
}

const topic = t.oneOf(TOPICS)
const level = t.oneOf(LEVELS)

export const EVENT_SPECS = {
  // A visit began. `returning` and `visit` come from the visitor's own browser.
  app_open: {
    returning: t.bool,
    visit: t.int,
    days_since_first: t.int,
    has_plan: t.bool,
    ref: t.host,
    lang: t.token,
  },
  wizard_step: { step: t.oneOf(STEPS), idx: t.int, dir: t.oneOf(['next', 'back']) },
  // The wizard was finished. Note there is deliberately no goal text, only its length.
  plan_started: {
    topic,
    level,
    focus: t.tokens(4),
    reasons: t.tokens(6),
    format: t.oneOf(FORMATS),
    days: t.int,
    minutes: t.int,
    goal_len: t.int,
    sessions: t.int,
    total_min: t.int,
    again: t.bool,
  },
  dashboard_view: { topic, level, done_pct: t.int, streak: t.int, overdue: t.int, day_in_plan: t.int },
  session_done: { topic, level, mins: t.int, units: t.int, items: t.tokens(8) },
  session_undone: { topic, level, mins: t.int },
  resource_click: { item: t.token, part: t.int, type: t.oneOf(['video', 'article']), topic, level },
  quiz_open: { topic, level, attempt: t.int },
  quiz_complete: { topic, level, correct: t.int, total: t.int, attempt: t.int },
  plan_complete: { topic, level, sessions: t.int, days: t.int },
  replan: { overdue: t.int },
  start_over: { done_pct: t.int },
  new_plan: {},
  // Seconds the page was actually visible since the last report.
  visible_time: { s: t.int },
  js_error: { msg: t.text(140), where: t.text(60) },
}

export const EVENT_NAMES = Object.keys(EVENT_SPECS)

const ID = /^[A-Za-z0-9-]{8,64}$/

export function cleanProps(name, raw) {
  const spec = EVENT_SPECS[name]
  const props = {}
  if (!spec || !raw || typeof raw !== 'object') return props
  for (const [key, check] of Object.entries(spec)) {
    const value = check(raw[key])
    if (value !== undefined) props[key] = value
  }
  return props
}

/**
 * Validates and normalizes a batch sent by the browser.
 * Returns { ok: true, vid, sid, ctx, events } or { ok: false, reason }.
 */
export function normalizeBatch(body, now = Date.now()) {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'bad_body' }
  if (typeof body.vid !== 'string' || !ID.test(body.vid)) return { ok: false, reason: 'bad_vid' }
  if (typeof body.sid !== 'string' || !ID.test(body.sid)) return { ok: false, reason: 'bad_sid' }
  if (!Array.isArray(body.events) || body.events.length === 0) return { ok: false, reason: 'no_events' }

  const ctxIn = body.ctx && typeof body.ctx === 'object' ? body.ctx : {}
  const ctx = {
    device: ['mobile', 'tablet', 'desktop'].includes(ctxIn.dev) ? ctxIn.dev : null,
    // minutes east of UTC, e.g. India = 330. Lets us see local time-of-day patterns.
    tzo: Number.isFinite(ctxIn.tzo) ? Math.max(-840, Math.min(840, Math.round(ctxIn.tzo))) : null,
  }

  const events = []
  for (const e of body.events.slice(0, MAX_EVENTS_PER_BATCH)) {
    if (!e || typeof e.n !== 'string' || !(e.n in EVENT_SPECS)) continue
    const dt = Number.isFinite(e.dt) ? Math.max(0, Math.min(MAX_EVENT_AGE_MS, e.dt)) : 0
    events.push({ name: e.n, props: cleanProps(e.n, e.p), ts: new Date(now - dt) })
  }
  if (events.length === 0) return { ok: false, reason: 'no_valid_events' }
  return { ok: true, vid: body.vid, sid: body.sid, ctx, events }
}

// Crawlers, link previews and headless automation shouldn't count as users.
const BOT =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|node-fetch/i
export function isBot(userAgent) {
  return !userAgent || BOT.test(userAgent)
}

// Only accept events sent from our own pages (a courtesy filter, not security).
export function originAllowed(headers, allowedHosts) {
  const source = headers.origin || headers.referer
  if (!source) return true
  try {
    return allowedHosts.includes(new URL(source).hostname)
  } catch {
    return false
  }
}
