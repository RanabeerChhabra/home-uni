// Turns raw events into the numbers on the stats dashboard.
//
// Queries use these named placeholders, bound only where a query mentions them:
//   :since = start of the window (timestamptz)
//   :tz    = the viewer's IANA time zone, used to decide what "today" and a "day" are
//   :now   = "now" (a parameter so tests are deterministic)

import { CURRICULUM } from '../../src/data/curriculum.js'

// Queries use the named placeholders :since, :tz and :now. Postgres requires every numbered
// parameter to be used, so this binds only the ones each query actually mentions.
export function bind(sql, values) {
  const order = []
  const text = sql.replace(/(?<!:):(since|tz|now)\b/g, (_, key) => {
    let i = order.indexOf(key)
    if (i < 0) i = order.push(key) - 1
    return `$${i + 1}`
  })
  return [text, order.map((k) => values[k])]
}

const num = (v) => (v == null ? 0 : Number(v))
const round1 = (v) => (v == null ? null : Math.round(Number(v) * 10) / 10)

const TITLES = new Map()
for (const levels of Object.values(CURRICULUM)) {
  for (const items of Object.values(levels)) for (const i of items) TITLES.set(i.id, i.title)
}

export const WIZARD_STEPS = ['topic', 'level', 'focus', 'goal', 'format', 'pace', 'review']

export async function safeTimeZone(db, tz) {
  if (typeof tz !== 'string' || !/^[A-Za-z0-9_+\-/]{1,40}$/.test(tz)) return 'UTC'
  try {
    await db.query(`SELECT now() AT TIME ZONE $1 AS x`, [tz])
    return tz
  } catch {
    return 'UTC'
  }
}

function localDayKeys(now, days, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const keys = []
  for (let i = days - 1; i >= 0; i--) keys.push(fmt.format(new Date(now.getTime() - i * 86_400_000)))
  return [...new Set(keys)]
}

export async function computeStats(db, { days = 30, tz = 'UTC', now = new Date() } = {}) {
  days = Math.max(1, Math.min(365, Math.round(days)))
  tz = await safeTimeZone(db, tz)
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const nowIso = now.toISOString()
  const q = (sql) => db.query(...bind(sql, { since, tz, now: nowIso }))
  const today = `(:now::timestamptz AT TIME ZONE :tz)::date`
  const todayStart = `(date_trunc('day', :now::timestamptz AT TIME ZONE :tz) AT TIME ZONE :tz)`

  const [
    totals,
    daily,
    funnel,
    wizard,
    choices,
    clicked,
    completed,
    quizzes,
    retention,
    visits,
    visible,
    activation,
    timeToPlan,
    patterns,
    audience,
    errors,
    eventCounts,
  ] = await Promise.all([
    q(
      `SELECT
         count(DISTINCT vid) FILTER (WHERE name = 'app_open' AND ts >= :since) AS visitors,
         count(DISTINCT sid) FILTER (WHERE ts >= :since) AS visits,
         count(DISTINCT vid) FILTER (WHERE name = 'app_open' AND ts >= ${todayStart}) AS today,
         count(DISTINCT vid) FILTER (WHERE name = 'app_open' AND ts >= :now::timestamptz - interval '7 days') AS last7,
         count(DISTINCT vid) FILTER (WHERE name = 'app_open' AND ts >= :now::timestamptz - interval '30 days') AS last30,
         count(DISTINCT vid) FILTER (WHERE name = 'app_open') AS all_time,
         count(*) FILTER (WHERE ts >= :since) AS events,
         count(DISTINCT vid) FILTER (WHERE name = 'plan_started' AND ts >= :since) AS planners,
         count(*) FILTER (WHERE name = 'plan_started' AND ts >= :since) AS plans_started,
         count(*) FILTER (WHERE name = 'session_done' AND ts >= :since) AS sessions_done,
         count(DISTINCT vid) FILTER (WHERE name = 'session_done' AND ts >= :since) AS learners,
         count(DISTINCT vid) FILTER (WHERE name = 'app_open' AND ts >= :since
           AND coalesce((props->>'returning')::boolean, false)) AS returning_visitors,
         min(ts) AS first_event
       FROM events`,
    ),
    q(
      `SELECT to_char((e.ts AT TIME ZONE :tz)::date, 'YYYY-MM-DD') AS day,
         count(DISTINCT e.vid) FILTER (WHERE e.name = 'app_open') AS visitors,
         count(DISTINCT e.vid) FILTER (WHERE e.name = 'app_open'
           AND (f.first_ts AT TIME ZONE :tz)::date = (e.ts AT TIME ZONE :tz)::date) AS new_visitors,
         count(*) FILTER (WHERE e.name = 'plan_started') AS plans,
         count(*) FILTER (WHERE e.name = 'session_done') AS sessions
       FROM events e
       JOIN (SELECT vid, min(ts) AS first_ts FROM events WHERE name = 'app_open' GROUP BY vid) f USING (vid)
       WHERE e.ts >= :since
       GROUP BY 1 ORDER BY 1`,
    ),
    q(
      `SELECT
         count(*) AS opened,
         count(*) FILTER (WHERE wiz) AS wizard,
         count(*) FILTER (WHERE planned) AS planned,
         count(*) FILTER (WHERE done1) AS first_session,
         count(*) FILTER (WHERE done3) AS three_sessions,
         count(*) FILTER (WHERE quizzed) AS quizzed,
         count(*) FILTER (WHERE days_active >= 2) AS came_back,
         count(*) FILTER (WHERE finished) AS finished_plan
       FROM (
         SELECT vid,
           bool_or(name = 'wizard_step') AS wiz,
           bool_or(name = 'plan_started') AS planned,
           count(*) FILTER (WHERE name = 'session_done') >= 1 AS done1,
           count(*) FILTER (WHERE name = 'session_done') >= 3 AS done3,
           bool_or(name = 'quiz_complete') AS quizzed,
           count(DISTINCT (ts AT TIME ZONE :tz)::date) FILTER (WHERE name = 'app_open') AS days_active,
           bool_or(name = 'plan_complete') AS finished
         FROM events WHERE ts >= :since GROUP BY vid HAVING bool_or(name = 'app_open')
       ) v`,
    ),
    q(
      `SELECT props->>'step' AS step, count(DISTINCT vid) AS visitors
       FROM events WHERE name = 'wizard_step' AND ts >= :since GROUP BY 1`,
    ),
    q(
      `SELECT dim, value, n FROM (
         SELECT 'topic' AS dim, props->>'topic' AS value, count(*) AS n FROM events WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'level', props->>'level', count(*) FROM events WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'topic_level', (props->>'topic') || ' · ' || (props->>'level'), count(*) FROM events WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'format', props->>'format', count(*) FROM events WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'days_per_week', props->>'days', count(*) FROM events WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'session_minutes', props->>'minutes', count(*) FROM events WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'focus', (props->>'topic') || ': ' || f, count(*) FROM events, jsonb_array_elements_text(props->'focus') f WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'reason', r, count(*) FROM events, jsonb_array_elements_text(props->'reasons') r WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'wrote_a_goal', CASE WHEN coalesce((props->>'goal_len')::int, 0) > 0 THEN 'yes' ELSE 'no' END, count(*) FROM events WHERE name = 'plan_started' AND ts >= :since GROUP BY 2
       ) c WHERE value IS NOT NULL ORDER BY dim, n DESC`,
    ),
    q(
      `SELECT props->>'item' AS item, count(*) AS n, count(DISTINCT vid) AS people
       FROM events WHERE name = 'resource_click' AND ts >= :since AND props ? 'item' GROUP BY 1 ORDER BY n DESC LIMIT 15`,
    ),
    q(
      `SELECT i AS item, count(*) AS n, count(DISTINCT vid) AS people
       FROM events, jsonb_array_elements_text(props->'items') i
       WHERE name = 'session_done' AND ts >= :since GROUP BY 1 ORDER BY n DESC LIMIT 15`,
    ),
    q(
      `SELECT props->>'topic' AS topic, count(*) AS attempts, count(DISTINCT vid) AS people,
         avg((props->>'correct')::numeric / NULLIF((props->>'total')::numeric, 0)) AS avg_score
       FROM events WHERE name = 'quiz_complete' AND ts >= :since GROUP BY 1 ORDER BY attempts DESC`,
    ),
    q(
      `WITH act AS (
         SELECT vid, (ts AT TIME ZONE :tz)::date AS d FROM events WHERE name = 'app_open' GROUP BY 1, 2
       ), first AS (
         SELECT vid, min(d) AS f FROM act GROUP BY vid
       ), flags AS (
         SELECT f.vid, f.f,
           bool_or(a.d = f.f + 1) AS d1,
           bool_or(a.d BETWEEN f.f + 1 AND f.f + 7) AS w1
         FROM first f JOIN act a USING (vid)
         WHERE f.f >= (:since::timestamptz AT TIME ZONE :tz)::date
         GROUP BY f.vid, f.f
       )
       SELECT
         count(*) FILTER (WHERE f <= ${today} - 1) AS d1_eligible,
         count(*) FILTER (WHERE f <= ${today} - 1 AND d1) AS d1_returned,
         count(*) FILTER (WHERE f <= ${today} - 7) AS w1_eligible,
         count(*) FILTER (WHERE f <= ${today} - 7 AND w1) AS w1_returned
       FROM flags`,
    ),
    q(
      `SELECT count(*) AS visitors, avg(v) AS avg_visits,
         count(*) FILTER (WHERE v = 1) AS once,
         count(*) FILTER (WHERE v BETWEEN 2 AND 3) AS two_three,
         count(*) FILTER (WHERE v BETWEEN 4 AND 7) AS four_seven,
         count(*) FILTER (WHERE v >= 8) AS eight_plus
       FROM (SELECT vid, count(DISTINCT sid) AS v FROM events WHERE ts >= :since GROUP BY vid) s`,
    ),
    q(
      `SELECT coalesce(sum((props->>'s')::int), 0) AS total_s, count(DISTINCT sid) AS visits
       FROM events WHERE name = 'visible_time' AND ts >= :since`,
    ),
    q(
      `SELECT count(*) AS planners,
         count(*) FILTER (WHERE n = 0) AS none,
         count(*) FILTER (WHERE n = 1) AS one,
         count(*) FILTER (WHERE n BETWEEN 2 AND 3) AS two_three,
         count(*) FILTER (WHERE n BETWEEN 4 AND 7) AS four_seven,
         count(*) FILTER (WHERE n >= 8) AS eight_plus
       FROM (
         SELECT p.vid, count(d.id) AS n
         FROM (SELECT DISTINCT vid FROM events WHERE name = 'plan_started' AND ts >= :since) p
         LEFT JOIN events d ON d.vid = p.vid AND d.name = 'session_done' AND d.ts >= :since
         GROUP BY p.vid
       ) x`,
    ),
    q(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (planned - opened)) / 60) AS median_min,
              count(*) AS n
       FROM (
         SELECT vid, min(ts) FILTER (WHERE name = 'app_open') AS opened, min(ts) FILTER (WHERE name = 'plan_started') AS planned
         FROM events WHERE ts >= :since GROUP BY vid
       ) x WHERE planned IS NOT NULL AND opened IS NOT NULL AND planned >= opened`,
    ),
    q(
      `SELECT name,
         extract(isodow FROM ts + make_interval(mins => coalesce(tzo, 0)))::int AS dow,
         extract(hour FROM ts + make_interval(mins => coalesce(tzo, 0)))::int AS hr,
         count(*) AS n
       FROM events WHERE name IN ('app_open', 'session_done') AND ts >= :since GROUP BY 1, 2, 3`,
    ),
    q(
      `SELECT dim, value, n FROM (
         SELECT 'country' AS dim, coalesce(country, 'unknown') AS value, count(DISTINCT vid) AS n FROM events WHERE name = 'app_open' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'device', coalesce(device, 'unknown'), count(DISTINCT vid) FROM events WHERE name = 'app_open' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'referrer', coalesce(props->>'ref', 'direct'), count(*) FROM events WHERE name = 'app_open' AND ts >= :since GROUP BY 2
         UNION ALL SELECT 'language', coalesce(props->>'lang', 'unknown'), count(DISTINCT vid) FROM events WHERE name = 'app_open' AND ts >= :since GROUP BY 2
       ) a ORDER BY dim, n DESC`,
    ),
    q(
      `SELECT props->>'msg' AS msg, props->>'where' AS "where", count(*) AS n, count(DISTINCT vid) AS people, max(ts) AS last_seen
       FROM events WHERE name = 'js_error' AND ts >= :since GROUP BY 1, 2 ORDER BY n DESC LIMIT 10`,
    ),
    q(`SELECT name, count(*) AS n FROM events WHERE ts >= :since GROUP BY 1 ORDER BY n DESC`),
  ])

  const t = totals[0] ?? {}
  const f = funnel[0] ?? {}

  // Daily series with empty days filled in.
  const byDay = new Map(daily.map((r) => [r.day, r]))
  const dailySeries = localDayKeys(now, days, tz).map((day) => {
    const r = byDay.get(day)
    return {
      day,
      visitors: num(r?.visitors),
      newVisitors: num(r?.new_visitors),
      plans: num(r?.plans),
      sessions: num(r?.sessions),
    }
  })

  const reached = new Map(wizard.map((r) => [r.step, num(r.visitors)]))
  const wizardSteps = WIZARD_STEPS.map((step) => ({ step, visitors: reached.get(step) ?? 0 }))

  const groupedChoices = {}
  for (const r of choices) (groupedChoices[r.dim] ??= []).push({ value: r.value, n: num(r.n) })
  const groupedAudience = {}
  for (const r of audience) (groupedAudience[r.dim] ??= []).push({ value: r.value, n: num(r.n) })

  const label = (r) => ({ id: r.item, title: TITLES.get(r.item) ?? r.item, n: num(r.n), people: num(r.people) })

  const heat = { app_open: [], session_done: [] }
  for (const r of patterns) heat[r.name]?.push({ dow: num(r.dow), hour: num(r.hr), n: num(r.n) })

  const rate = (a, b) => (num(b) > 0 ? Math.round((num(a) / num(b)) * 1000) / 10 : null)
  const v = visits[0] ?? {}
  const vis = visible[0] ?? {}
  const act = activation[0] ?? {}
  const ret = retention[0] ?? {}
  const ttp = timeToPlan[0] ?? {}

  return {
    generatedAt: nowIso,
    days,
    tz,
    totals: {
      visitors: num(t.visitors),
      visits: num(t.visits),
      today: num(t.today),
      last7: num(t.last7),
      last30: num(t.last30),
      allTime: num(t.all_time),
      events: num(t.events),
      planners: num(t.planners),
      plansStarted: num(t.plans_started),
      sessionsDone: num(t.sessions_done),
      learners: num(t.learners),
      returningVisitors: num(t.returning_visitors),
      firstEvent: t.first_event ?? null,
      // Rough stickiness: average daily visitors as a share of the last 30 days' visitors.
      stickiness:
        num(t.last30) > 0 && dailySeries.length
          ? Math.round((dailySeries.reduce((s, d) => s + d.visitors, 0) / dailySeries.length / num(t.last30)) * 1000) /
            10
          : null,
    },
    daily: dailySeries,
    funnel: [
      { key: 'opened', label: 'Opened the app', visitors: num(f.opened) },
      { key: 'wizard', label: 'Started setup', visitors: num(f.wizard) },
      { key: 'planned', label: 'Built a plan', visitors: num(f.planned) },
      { key: 'first_session', label: 'Finished a session', visitors: num(f.first_session) },
      { key: 'three_sessions', label: 'Finished 3+ sessions', visitors: num(f.three_sessions) },
      { key: 'quizzed', label: 'Took a quiz', visitors: num(f.quizzed) },
      { key: 'came_back', label: 'Came back on another day', visitors: num(f.came_back) },
      { key: 'finished_plan', label: 'Finished a whole plan', visitors: num(f.finished_plan) },
    ],
    wizard: { steps: wizardSteps, planned: num(f.planned) },
    choices: groupedChoices,
    resources: { clicked: clicked.map(label), completed: completed.map(label) },
    quizzes: quizzes.map((r) => ({
      topic: r.topic,
      attempts: num(r.attempts),
      people: num(r.people),
      avgScore: r.avg_score == null ? null : Math.round(Number(r.avg_score) * 100),
    })),
    retention: {
      day1: {
        eligible: num(ret.d1_eligible),
        returned: num(ret.d1_returned),
        rate: rate(ret.d1_returned, ret.d1_eligible),
      },
      week1: {
        eligible: num(ret.w1_eligible),
        returned: num(ret.w1_returned),
        rate: rate(ret.w1_returned, ret.w1_eligible),
      },
    },
    engagement: {
      avgVisitsPerVisitor: round1(v.avg_visits),
      visitBuckets: {
        once: num(v.once),
        twoToThree: num(v.two_three),
        fourToSeven: num(v.four_seven),
        eightPlus: num(v.eight_plus),
      },
      avgMinutesPerVisit: num(vis.visits) > 0 ? round1(num(vis.total_s) / 60 / num(vis.visits)) : null,
      medianMinutesToFirstPlan: ttp.median_min == null ? null : round1(ttp.median_min),
      sessionsDonePerPlanner: {
        none: num(act.none),
        one: num(act.one),
        twoToThree: num(act.two_three),
        fourToSeven: num(act.four_seven),
        eightPlus: num(act.eight_plus),
      },
    },
    patterns: heat,
    audience: groupedAudience,
    errors: errors.map((r) => ({
      msg: r.msg,
      where: r.where,
      n: num(r.n),
      people: num(r.people),
      lastSeen: r.last_seen,
    })),
    eventCounts: eventCounts.map((r) => ({ name: r.name, n: num(r.n) })),
  }
}
