import { useCallback, useEffect, useMemo, useState } from 'react'
import Wizard from './components/Wizard.jsx'
import Dashboard from './components/Dashboard.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { QuizModal } from './components/Quiz.jsx'
import { CURRICULUM } from './data/curriculum.js'
import { QUIZ_BANK } from './data/quizzes.js'
import videoMeta from './data/videoMeta.json'
import { buildPlan, isSessionDone, overdueSessions, progress } from './utils/plan.js'
import { enrich } from './utils/resources.js'
import { tailorItems } from './utils/tailor.js'
import { quizStatus, POINTS_PER_CORRECT } from './utils/quiz.js'
import { clearState, loadState, saveState } from './utils/storage.js'
import { initialStreak, recordActivity } from './utils/streak.js'
import { diffDays, fromKey, startOfDay, toKey } from './utils/dates.js'
import { startAnalytics, track } from './utils/analytics.js'

const saved = loadState()

// Reasons are fixed labels ("Switch careers"); analytics gets a stable token instead.
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

// Re-renders when the calendar day changes, so "today" never goes stale in a long-lived tab.
function useToday() {
  const [today, setToday] = useState(() => startOfDay(new Date()))
  useEffect(() => {
    const tick = () => setToday((prev) => (toKey(prev) === toKey(new Date()) ? prev : startOfDay(new Date())))
    const id = setInterval(tick, 60 * 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

export default function App() {
  const [profile, setProfile] = useState(saved?.profile ?? null)
  const [done, setDone] = useState(() => new Set(saved?.done ?? []))
  const [streak, setStreak] = useState(saved?.streak ?? initialStreak())
  const [quizResults, setQuizResults] = useState(saved?.quizResults ?? {})
  const [openQuiz, setOpenQuiz] = useState(null) // { block, questionIds, attempt }
  const [confirm, setConfirm] = useState(null) // 'startOver' | 'replan'
  const [building, setBuilding] = useState(false) // wizard shown over an existing plan
  const today = useToday()

  useEffect(() => startAnalytics({ hasPlan: Boolean(saved?.profile) }), [])

  const plan = useMemo(() => {
    if (!profile) return null
    const all = CURRICULUM[profile.topic][profile.level]
    const items = tailorItems(all, {
      focus: profile.focus,
      format: profile.format,
      minutesOf: (i) => enrich(i, videoMeta).minutes,
    })
    return buildPlan({
      items,
      capacity: profile.sessionMinutes,
      daysPerWeek: profile.daysPerWeek,
      startDate: fromKey(profile.startDate),
      archived: new Set(profile.archived),
      meta: videoMeta,
    })
  }, [profile])

  useEffect(() => {
    if (!profile) return
    saveState({ profile, done: [...done], streak, quizResults })
  }, [profile, done, streak, quizResults])

  const quizXp = Object.values(quizResults).reduce((sum, r) => sum + r.best * POINTS_PER_CORRECT, 0)
  const learnedXp = useMemo(() => {
    if (!plan) return 0
    let sum = 0
    for (const u of plan.allUnits) if (done.has(u.id)) sum += u.minutes
    return sum
  }, [plan, done])
  const xp = learnedXp + quizXp

  const startPlan = useCallback(
    (newProfile, summary) => {
      track('plan_started', {
        topic: newProfile.topic,
        level: newProfile.level,
        focus: newProfile.focus,
        reasons: newProfile.reasons.map(slug),
        format: newProfile.format,
        days: newProfile.daysPerWeek,
        minutes: newProfile.sessionMinutes,
        goal_len: newProfile.goal.length, // only the length: what someone writes is never sent
        sessions: summary?.sessions,
        total_min: summary?.totalMin,
        again: building,
      })
      setProfile(newProfile)
      setDone(new Set())
      setQuizResults({})
      setBuilding(false)
    },
    [building],
  )

  const toggleSession = useCallback(
    (session) => {
      const completed = isSessionDone(session, done)
      const next = new Set(done)
      for (const u of session.units) {
        if (completed) next.delete(u.id)
        else next.add(u.id)
      }
      setDone(next)

      const where = { topic: profile.topic, level: profile.level }
      if (completed) {
        track('session_undone', { ...where, mins: session.minutes })
        return
      }
      setStreak((s) => recordActivity(s, new Date()))
      track('session_done', {
        ...where,
        mins: session.minutes,
        units: session.units.length,
        items: [...new Set(session.units.map((u) => u.itemId))],
      })
      if (plan.sessions.every((s) => isSessionDone(s, next))) {
        track('plan_complete', {
          ...where,
          sessions: plan.sessions.length,
          days: diffDays(new Date(), fromKey(profile.startDate)),
        })
      }
    },
    [done, plan, profile],
  )

  function replan() {
    track('replan', { overdue: overdueSessions(plan, done, today).length })
    // Everything finished so far is kept (archived); the rest restarts from today.
    setProfile((p) => ({ ...p, startDate: toKey(new Date()), archived: [...done] }))
    setConfirm(null)
  }

  function startOver() {
    track('start_over', { done_pct: Math.round(progress(plan, done).fraction * 100) })
    clearState()
    setProfile(null)
    setDone(new Set())
    setStreak(initialStreak())
    setQuizResults({})
    setConfirm(null)
  }

  function openQuizFor(block) {
    const status = quizStatus(block, plan, done, QUIZ_BANK)
    if (!status.unlocked) return
    track('quiz_open', {
      topic: profile.topic,
      level: profile.level,
      attempt: (quizResults[block.id]?.attempts ?? 0) + 1,
    })
    setOpenQuiz({ block, questionIds: status.questionIds, attempt: quizResults[block.id]?.attempts ?? 0 })
  }

  function finishQuiz(correct, total) {
    const id = openQuiz.block.id
    track('quiz_complete', {
      topic: profile.topic,
      level: profile.level,
      correct,
      total,
      attempt: (quizResults[id]?.attempts ?? 0) + 1,
    })
    setQuizResults((prev) => {
      const old = prev[id]
      return { ...prev, [id]: { best: Math.max(old?.best ?? 0, correct), total, attempts: (old?.attempts ?? 0) + 1 } }
    })
  }

  if (!profile || building) {
    return <Wizard onComplete={startPlan} canCancel={building} onCancel={() => setBuilding(false)} />
  }

  return (
    <>
      <Dashboard
        profile={profile}
        plan={plan}
        done={done}
        streak={streak}
        quizResults={quizResults}
        today={today}
        xp={xp}
        onToggleSession={toggleSession}
        onOpenQuiz={openQuizFor}
        onReplan={() => setConfirm('replan')}
        onStartOver={() => setConfirm('startOver')}
        onNewPlan={() => {
          track('new_plan')
          setBuilding(true)
        }}
      />

      {openQuiz && (
        <QuizModal
          key={openQuiz.block.id + ':' + openQuiz.attempt}
          block={openQuiz.block}
          questionIds={openQuiz.questionIds}
          bank={QUIZ_BANK}
          attempt={openQuiz.attempt}
          previousBest={quizResults[openQuiz.block.id]?.best}
          onFinish={finishQuiz}
          onClose={() => setOpenQuiz(null)}
        />
      )}

      <ConfirmDialog
        open={confirm === 'replan'}
        title="Replan from today?"
        confirmLabel="Replan"
        onConfirm={replan}
        onCancel={() => setConfirm(null)}
      >
        Everything you haven't finished is rescheduled starting today, using the same rhythm. Sessions you've completed
        stay completed and keep their XP.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'startOver'}
        title="Start over?"
        confirmLabel="Delete my progress"
        danger
        onConfirm={startOver}
        onCancel={() => setConfirm(null)}
      >
        This deletes your plan, XP, streak and quiz scores from this browser. This can't be undone.
      </ConfirmDialog>
    </>
  )
}
