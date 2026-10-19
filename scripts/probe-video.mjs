// Prints real title / channel / duration / views for YouTube ids or URLs.
//   node scripts/probe-video.mjs <id-or-url> [...]
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

function toId(arg) {
  try {
    const u = new URL(arg)
    return u.searchParams.get('v') ?? u.pathname.slice(1)
  } catch {
    return arg
  }
}

async function probe(id) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(25000),
    })
    const text = await res.text()
    const playable = text.match(/"playabilityStatus":\{"status":"(\w+)"/)?.[1] ?? '?'
    const title = (text.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').replace(/ - YouTube$/, '')
    const channel = text.match(/"author":"([^"]*)"/)?.[1] ?? ''
    const sec = Number(text.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0)
    const views = Number(text.match(/"viewCount":"(\d+)"/)?.[1] ?? 0)
    return `${id.padEnd(12)} ${playable.padEnd(5)} ${String(views).padStart(10)} views ${String(Math.round(sec / 60)).padStart(4)}m  ${channel.slice(0, 24).padEnd(24)} ${title.slice(0, 70)}`
  } catch (e) {
    return `${id.padEnd(12)} ERROR ${e.message}`
  }
}

const ids = process.argv.slice(2).map(toId)
for (const line of await Promise.all(ids.map(probe))) console.log(line)
