// Anonymous, first-party usage analytics.
//
// What it does: counts visits and records which features are used, so the
// product can be improved. What it deliberately does NOT do: no accounts, no
// cookies, no IP or fingerprinting, and no free text (the goal someone types is
// never sent). A visitor is a random id stored in this browser.
//
// It stays quiet when a person has opted out, sends Do Not Track / Global
// Privacy Control, is an automated browser, or when running outside production.

export const ENDPOINT = '/api/hu/collect'
export const FORGET_ENDPOINT = '/api/hu/forget'

const KEY = {
  vid: 'homeuni:vid',
  first: 'homeuni:first',
  visits: 'homeuni:visits',
  optOut: 'homeuni:optout',
}

const FLUSH_AFTER_MS = 4000
const FLUSH_AT = 12
const MAX_QUEUE = 80
const MAX_ERRORS_PER_SESSION = 5

function uuid(random = Math.random) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const hex = () =>
    Math.floor(random() * 0x10000)
      .toString(16)
      .padStart(4, '0')
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`
}

function read(storage, key) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}
function write(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    /* storage blocked: analytics simply stays off for this visitor */
  }
}

/**
 * Whether tracking is allowed for this browser. Pure so it can be tested.
 * `nav` is the navigator-like object, `storage` is localStorage-like.
 */
export function trackingAllowed({ nav = {}, storage, production = false } = {}) {
  if (!production) return { allowed: false, reason: 'not_production' }
  if (nav.webdriver) return { allowed: false, reason: 'automation' }
  if (nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || nav.msDoNotTrack === '1')
    return { allowed: false, reason: 'do_not_track' }
  if (nav.globalPrivacyControl === true) return { allowed: false, reason: 'global_privacy_control' }
  if (storage && read(storage, KEY.optOut) === '1') return { allowed: false, reason: 'opted_out' }
  return { allowed: true, reason: null }
}

export function deviceClass(width) {
  return width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'
}

export function referrerHost(referrer, ownHost) {
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    return host && host !== ownHost ? host.slice(0, 60) : undefined
  } catch {
    return undefined
  }
}

export function createTracker({
  storage,
  session,
  nav = {},
  production = false,
  transport,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  context = () => ({ dev: 'desktop', tzo: 0 }),
} = {}) {
  let queue = []
  let timer = null
  let started = false
  let errorCount = 0

  const status = () => trackingAllowed({ nav, storage, production })
  const enabled = () => status().allowed && Boolean(storage && session)

  function ids() {
    let vid = read(storage, KEY.vid)
    const returning = Boolean(vid)
    if (!vid) {
      vid = uuid()
      write(storage, KEY.vid, vid)
      write(storage, KEY.first, String(now()))
    }
    let sid = read(session, 'homeuni:sid')
    if (!sid) {
      sid = uuid()
      write(session, 'homeuni:sid', sid)
    }
    return { vid, sid, returning }
  }

  function flush({ beacon = false } = {}) {
    if (timer) {
      clearTimer(timer)
      timer = null
    }
    if (!queue.length || !enabled()) {
      queue = []
      return
    }
    const { vid, sid } = ids()
    const sentAt = now()
    const batch = queue.splice(0, queue.length)
    const body = {
      v: 1,
      vid,
      sid,
      ctx: context(),
      events: batch.map((e) => ({ n: e.n, p: e.p, dt: Math.max(0, sentAt - e.t) })),
    }
    try {
      transport(body, { beacon })
    } catch {
      /* analytics must never throw into the app */
    }
  }

  function track(name, props = {}) {
    if (!enabled()) return
    queue.push({ n: name, p: props, t: now() })
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
    if (queue.length >= FLUSH_AT) flush()
    else if (!timer) timer = setTimer(() => flush(), FLUSH_AFTER_MS)
  }

  // Called once per page load.
  function start({ hasPlan = false, lang, referrer, ownHost } = {}) {
    if (started || !enabled()) return
    started = true
    const { returning } = ids()
    const visit = (Number(read(storage, KEY.visits)) || 0) + 1
    write(storage, KEY.visits, String(visit))
    const first = Number(read(storage, KEY.first)) || now()
    track('app_open', {
      returning,
      visit,
      days_since_first: Math.max(0, Math.floor((now() - first) / 86_400_000)),
      has_plan: hasPlan,
      ref: referrerHost(referrer, ownHost),
      lang: typeof lang === 'string' ? lang.split('-')[0].toLowerCase().slice(0, 8) : undefined,
    })
  }

  function trackError(message, where) {
    if (errorCount >= MAX_ERRORS_PER_SESSION) return
    errorCount++
    track('js_error', { msg: String(message ?? 'unknown'), where })
  }

  const optedOut = () => read(storage, KEY.optOut) === '1'

  // Opting out also deletes what was already stored for this visitor.
  async function optOut(forget) {
    const vid = read(storage, KEY.vid)
    queue = []
    write(storage, KEY.optOut, '1')
    write(storage, KEY.vid, null)
    write(storage, KEY.first, null)
    write(storage, KEY.visits, null)
    started = false
    if (vid && forget) {
      try {
        await forget(vid)
      } catch {
        /* best effort */
      }
    }
  }

  function optIn() {
    write(storage, KEY.optOut, null)
  }

  return { track, start, flush, trackError, optOut, optIn, optedOut, enabled, status }
}

// ── the real, browser-bound instance ──

function browserTransport(body, { beacon }) {
  const json = JSON.stringify(body)
  // text/plain keeps this a "simple" request: no CORS preflight, and it works with sendBeacon.
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'text/plain;charset=UTF-8' }))
    return
  }
  fetch(ENDPOINT, {
    method: 'POST',
    body: json,
    keepalive: true,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  }).catch(() => {})
}

function forgetOnServer(vid) {
  return fetch(FORGET_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({ vid }),
    keepalive: true,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  })
}

function safeStorage(kind) {
  try {
    return globalThis[kind]
  } catch {
    return undefined
  }
}

const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

export const analytics = createTracker({
  storage: inBrowser ? safeStorage('localStorage') : undefined,
  session: inBrowser ? safeStorage('sessionStorage') : undefined,
  nav: inBrowser
    ? {
        webdriver: navigator.webdriver,
        doNotTrack: navigator.doNotTrack ?? window.doNotTrack,
        msDoNotTrack: navigator.msDoNotTrack,
        globalPrivacyControl: navigator.globalPrivacyControl,
      }
    : {},
  production: Boolean(import.meta.env?.PROD),
  transport: browserTransport,
  context: () => ({
    dev: deviceClass(window.innerWidth),
    tzo: -new Date().getTimezoneOffset(),
  }),
})

export const track = analytics.track

/**
 * Wires up the things that need the browser: the page-load event, time spent
 * with the page visible, and unexpected errors. Returns a cleanup function.
 */
export function startAnalytics({ hasPlan }) {
  if (!inBrowser || !analytics.enabled()) return () => {}
  analytics.start({
    hasPlan,
    lang: navigator.language,
    referrer: document.referrer,
    ownHost: location.hostname,
  })

  let visibleSince = document.visibilityState === 'visible' ? Date.now() : null
  const reportVisible = () => {
    if (visibleSince == null) return
    const s = Math.round((Date.now() - visibleSince) / 1000)
    visibleSince = null
    if (s > 0) analytics.track('visible_time', { s: Math.min(s, 3600) })
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      reportVisible()
      analytics.flush({ beacon: true })
    } else {
      visibleSince = Date.now()
    }
  }
  const onPageHide = () => {
    reportVisible()
    analytics.flush({ beacon: true })
  }
  const onError = (e) => analytics.trackError(e.message, 'window')
  const onRejection = (e) => analytics.trackError(e.reason?.message ?? e.reason, 'promise')

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

export const setOptOut = (value) => (value ? analytics.optOut(forgetOnServer) : Promise.resolve(analytics.optIn()))
export const isOptedOut = () => analytics.optedOut()
