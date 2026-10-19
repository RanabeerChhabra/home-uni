// Helpers for turning a curriculum entry into something schedulable and showable.

export function youtubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('youtube.com') && u.pathname === '/watch') return u.searchParams.get('v')
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
  } catch {
    /* not a URL */
  }
  return null
}

// Adds real, measured details when we have them. For YouTube videos the real
// duration replaces our estimate, which is what lets long videos be split.
export function enrich(item, meta = {}) {
  const ytId = youtubeId(item.url)
  const m = ytId ? meta[ytId] : null
  const durationSec = m?.durationSec > 0 ? m.durationSec : null
  return {
    ...item,
    ytId,
    durationSec,
    minutes: durationSec ? Math.max(1, Math.round(durationSec / 60)) : item.estMinutes,
    views: m?.views ?? null,
    channel: m?.channel ?? null,
  }
}

// Deep link into a YouTube video at a given second.
export function withStart(url, sec) {
  if (!sec || !youtubeId(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}t=${Math.round(sec)}s`
}

export function formatViews(n) {
  if (n == null) return null
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B views`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M views`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K views`
  return `${n} views`
}

export function formatMinutes(min) {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

// 3725 -> "1:02:05", 125 -> "2:05"
export function timestamp(sec) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const rr = String(r).padStart(2, '0')
  return h ? `${h}:${mm}:${rr}` : `${mm}:${rr}`
}
