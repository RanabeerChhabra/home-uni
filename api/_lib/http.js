// Small helpers shared by the analytics endpoints.

export const DEFAULT_HOSTS = ['rana.beer', 'www.rana.beer', 'homeuni-ten.vercel.app', 'localhost']

export function allowedHostsFrom(env = process.env) {
  const extra = (env.ANALYTICS_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...DEFAULT_HOSTS, ...extra])]
}

// Reads a JSON body whether the platform pre-parsed it or left it as text
// (navigator.sendBeacon sends text/plain).
export function readJson(req, maxBytes) {
  const raw = req.body
  if (raw == null) return { error: 'empty' }
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) {
    const size = Buffer.byteLength(JSON.stringify(raw))
    return size > maxBytes ? { error: 'too_large' } : { value: raw }
  }
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)
  if (Buffer.byteLength(text) > maxBytes) return { error: 'too_large' }
  try {
    return { value: JSON.parse(text) }
  } catch {
    return { error: 'bad_json' }
  }
}

export function countryFrom(headers) {
  const c = String(headers['x-vercel-ip-country'] || '').toUpperCase()
  return /^[A-Z]{2}$/.test(c) ? c : null
}
