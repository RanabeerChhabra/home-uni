# home uni

A personalized learning plan. Tell home uni what you want to learn and why, and it builds a curriculum from hand-picked videos and articles, scheduled around your week so every session is finishable.

**Live:** https://ascend-alpha-five.vercel.app

## How it works

1. **Onboarding** asks a handful of questions: topic, level, what you most want out of it (e.g. _start investing_, _build web apps_, _sleep better_), your goal in your own words, preferred format, and a realistic pace (days a week and minutes per session).
2. **Tailoring** keeps the resources that serve your focus, leads with them, and adds the essential background. Focus areas are only offered when a level has enough material for them.
3. **Planning** splits any video longer than a session into parts that each fit, with a timestamped deep link to where each part starts. Short items share a session. Everything is anchored to a fixed start date.
4. **Doing it**: tick a session to earn XP (one per minute learned) and grow your streak. If you fall behind, **Replan** reschedules what's left from today without touching what you've finished.
5. **Checkpoint quizzes** appear about every two weeks, built only from resources you've actually finished.

Topics: Finance, Business, Philosophy, Coding, Health & Longevity, each at Beginner, Intermediate and Advanced.

## Stack

React 19, Vite, Tailwind CSS v4. No backend; progress lives in `localStorage` (key `homeuni:v2`).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + data-integrity tests
npm run build
npm run check      # tests, then build
npm run format     # Prettier
```

## Keeping the content honest

Every video is verified, not assumed. `npm run verify-links` loads every resource, confirms each YouTube video is playable, records its real duration, channel and view count in `src/data/videoMeta.json` (which the planner uses to split long videos), and reports dead pages. The test suite fails if a video is missing metadata or has fewer than 90,000 views.

```bash
node scripts/yt-search.mjs "dynamic programming explained" 8   # find candidates with real view counts
node scripts/probe-video.mjs <youtube-id-or-url> ...           # check specific videos
```

Some sites (Cloudflare-protected pages) refuse automated requests; the checker reports those as "blocked", not "dead", and they need a manual look.

## Where things live

| Path                                         | What                                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| `src/data/curriculum.js`                     | The curated resources per topic and level, plus focus areas |
| `src/data/tags.js`                           | What each resource is about (drives tailoring)              |
| `src/data/quizzes.js`                        | One concept-check question per resource                     |
| `src/data/videoMeta.json`                    | Generated: real duration, channel and views per video       |
| `src/utils/plan.js`                          | Splits, packs and schedules sessions; quiz checkpoints      |
| `src/utils/tailor.js`                        | Chooses resources from the person's focus and format        |
| `src/utils/quiz.js`, `streak.js`, `dates.js` | Quiz building, streaks, and timezone-safe local dates       |
| `src/components/`                            | Wizard, Dashboard, SessionCard, Quiz, dialogs               |
| `tests/`                                     | Planner, streak, tailoring, quiz and data-integrity tests   |
