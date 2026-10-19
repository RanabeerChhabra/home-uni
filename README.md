# home uni

A personalized learning platform. Answer a short survey (topic, level, goal, weekly commitment) and home uni lays out a curated curriculum of videos and articles across a weekly calendar. Check items off to earn points and build a streak.

**Live:** https://ascend-alpha-five.vercel.app

## Topics
Finance, Business, Philosophy, Coding, Health & Longevity — each with Beginner, Intermediate and Advanced tracks.

## Stack
React 19, Vite, Tailwind CSS v4. No backend; progress is saved in `localStorage`.

## Run locally
```bash
npm install
npm run dev
```

## Where things live
- `src/data/curriculum.js` — the hand-curated resources per topic and level
- `src/utils/schedule.js` — spreads resources across days based on weekly frequency
- `src/utils/streak.js` — points and streak logic
- `src/components/` — Survey, Calendar, Logo
