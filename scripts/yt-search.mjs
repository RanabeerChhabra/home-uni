// Searches YouTube and prints top results with real view counts and length.
//   node scripts/yt-search.mjs "query" [maxResults=8]
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const query = process.argv[2]
const max = Number(process.argv[3] ?? 8)
if (!query) {
  console.error('usage: node scripts/yt-search.mjs "query" [max]')
  process.exit(1)
}

const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`, {
  headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  signal: AbortSignal.timeout(25000),
})
const html = await res.text()
const start = html.indexOf('var ytInitialData = ')
if (start < 0) {
  console.error('no ytInitialData (blocked or layout changed)')
  process.exit(1)
}
const jsonStart = start + 'var ytInitialData = '.length
const jsonEnd = html.indexOf(';</script>', jsonStart)
const data = JSON.parse(html.slice(jsonStart, jsonEnd))

const found = []
;(function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.videoRenderer) found.push(node.videoRenderer)
  for (const v of Array.isArray(node) ? node : Object.values(node)) walk(v)
})(data)

for (const v of found.slice(0, max)) {
  const views = v.viewCountText?.simpleText ?? v.viewCountText?.runs?.map((r) => r.text).join('') ?? '?'
  const len = v.lengthText?.simpleText ?? 'live'
  const chan = v.ownerText?.runs?.[0]?.text ?? ''
  const title = v.title?.runs?.map((r) => r.text).join('') ?? ''
  console.log(
    `${v.videoId}  ${views.padEnd(16)} ${len.padStart(8)}  ${chan.slice(0, 24).padEnd(24)} ${title.slice(0, 80)}`,
  )
}
