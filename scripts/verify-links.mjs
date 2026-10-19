// Verifies every resource in the curriculum and records real metadata.
//
//   node scripts/verify-links.mjs [reportPath]
//
// - YouTube videos: checks playability and extracts title, channel, duration
//   and view count straight from the watch page. Writes src/data/videoMeta.json.
// - Everything else: records the HTTP status (some sites block bots with 403/429;
//   those are reported as "blocked", not "dead").
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { CURRICULUM } from '../src/data/curriculum.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const META_PATH = path.join(here, '..', 'src', 'data', 'videoMeta.json')
const reportPath = process.argv[2] ?? path.join(here, 'link-report.json')

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

export function youtubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('youtube.com') && u.pathname === '/watch') return u.searchParams.get('v')
    if (u.hostname === 'youtu.be') return u.pathname.slice(1)
  } catch {
    /* not a URL */
  }
  return null
}

async function getText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  })
  return { status: res.status, text: await res.text() }
}

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

// The "author" field is a JSON string literal, so unescape it as JSON.
function unJson(s) {
  try {
    return JSON.parse(`"${s}"`)
  } catch {
    return s
  }
}

async function checkYouTube(id) {
  const { status, text } = await getText(`https://www.youtube.com/watch?v=${id}`)
  const playable = text.match(/"playabilityStatus":\{"status":"(\w+)"/)?.[1] ?? 'UNKNOWN'
  const title = text.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/ - YouTube$/, '')
  return {
    status,
    playable,
    title: title ? decode(title) : null,
    channel: unJson(text.match(/"author":"([^"]*)"/)?.[1] ?? '') || null,
    durationSec: Number(text.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0),
    views: Number(text.match(/"viewCount":"(\d+)"/)?.[1] ?? 0),
  }
}

async function checkPage(url) {
  try {
    const { status } = await getText(url)
    return { status }
  } catch (err) {
    return { status: 0, error: String(err.message ?? err) }
  }
}

async function pool(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const all = []
for (const [topic, levels] of Object.entries(CURRICULUM)) {
  for (const [level, items] of Object.entries(levels)) {
    for (const item of items) all.push({ topic, level, ...item })
  }
}

const results = await pool(all, 6, async (item) => {
  const id = youtubeId(item.url)
  try {
    if (id) return { ...item, kind: 'youtube', ytId: id, ...(await checkYouTube(id)) }
    return { ...item, kind: 'page', ...(await checkPage(item.url)) }
  } catch (err) {
    return { ...item, kind: id ? 'youtube' : 'page', status: 0, error: String(err.message ?? err) }
  }
})

const meta = {}
for (const r of results) {
  if (r.kind === 'youtube' && r.playable === 'OK') {
    meta[r.ytId] = { title: r.title, channel: r.channel, durationSec: r.durationSec, views: r.views }
  }
}
writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n')
writeFileSync(reportPath, JSON.stringify(results, null, 2) + '\n')

const yt = results.filter((r) => r.kind === 'youtube')
const bad = yt.filter((r) => r.playable !== 'OK')
const pages = results.filter((r) => r.kind === 'page')
const dead = pages.filter((r) => r.status === 404 || r.status === 410 || r.status === 0)
const blocked = pages.filter((r) => [401, 403, 429, 999].includes(r.status))

console.log(`\nChecked ${results.length} resources: ${yt.length} YouTube, ${pages.length} pages`)
console.log(`YouTube not playable: ${bad.length}`)
for (const r of bad) console.log(`  ✗ ${r.id}  ${r.url}  [${r.playable}]`)
console.log(`Pages dead (404/410/error): ${dead.length}`)
for (const r of dead) console.log(`  ✗ ${r.id}  ${r.url}  [${r.status} ${r.error ?? ''}]`)
console.log(`Pages blocked to bots (unverified): ${blocked.length}`)
for (const r of blocked) console.log(`  ? ${r.id}  ${r.url}  [${r.status}]`)
console.log(`\nLow-view videos (<90k):`)
for (const r of yt.filter((r) => r.playable === 'OK' && r.views < 90000)) {
  console.log(`  ${r.id}  ${r.views.toLocaleString()} views  ${r.title}`)
}
console.log(`\nReport: ${reportPath}\nMetadata: ${META_PATH}`)
