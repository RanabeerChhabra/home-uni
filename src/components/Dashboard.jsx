import { useMemo, useState } from 'react'
import { FOCUS_AREAS, TOPICS } from '../data/curriculum.js'
import { QUIZ_BANK } from '../data/quizzes.js'
import { isSessionDone, overdueSessions, progress, quizBlocks, upNext } from '../utils/plan.js'
import { quizStatus } from '../utils/quiz.js'
import { matchedFocus } from '../utils/tailor.js'
import { diffDays, sameDay } from '../utils/dates.js'
import { formatMinutes } from '../utils/resources.js'
import { activeStreak, practicedToday } from '../utils/streak.js'
import Logo from './Logo.jsx'
import SessionCard from './SessionCard.jsx'
import { QuizCard } from './Quiz.jsx'
import { Card, Chip, GhostButton, PrimaryButton } from './ui.jsx'

const fmt = (d, opts) => d.toLocaleDateString(undefined, opts)
const dayLabel = (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' })
const weekRange = (week) => {
  const a = week.days[0].date
  const b = week.days[6].date
  const sameMonth = a.getMonth() === b.getMonth()
  return `${fmt(a, { month: 'short', day: 'numeric' })} – ${fmt(b, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`
}

function Stat({ icon, value, label, tone }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="text-lg font-bold leading-tight text-ink">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

export default function Dashboard({
  profile,
  plan,
  done,
  streak,
  quizResults,
  today,
  xp,
  onToggleSession,
  onOpenQuiz,
  onReplan,
  onStartOver,
  onNewPlan,
}) {
  const [showAll, setShowAll] = useState(false)

  const topic = TOPICS.find((t) => t.id === profile.topic)
  const focusAreas = FOCUS_AREAS[profile.topic] ?? []
  const focusLabel = (id) => focusAreas.find((a) => a.id === id)?.label ?? id
  const focusFor = (itemId) => matchedFocus(itemId, profile.focus).map(focusLabel)

  const stats = progress(plan, done)
  const overdue = overdueSessions(plan, done, today)
  const next = upNext(plan, done, today)
  const blocks = useMemo(() => quizBlocks(plan), [plan])
  const blockAfterWeek = useMemo(() => new Map(blocks.map((b) => [b.afterWeek, b])), [blocks])
  const finished = plan.sessions.length > 0 && plan.sessions.every((s) => isSessionDone(s, done))
  const shownStreak = activeStreak(streak, today)
  const remainingSessions = plan.sessions.filter((s) => !isSessionDone(s, done))
  const remainingMinutes = remainingSessions.reduce((sum, s) => sum + s.minutes, 0)
  const followingSession =
    next.kind === 'doneToday' ? plan.sessions.find((s) => diffDays(s.date, today) > 0 && !isSessionDone(s, done)) : null

  // Which week are we in? Used to keep the visible window near "now".
  const currentWeekNumber = useMemo(() => {
    const first = plan.sessions.find((s) => !isSessionDone(s, done))
    const todayWeek = plan.weeks.find((w) => w.days.some((d) => sameDay(d.date, today)))
    return Math.max(1, (todayWeek ?? plan.weeks.find((w) => w.number === first?.week) ?? plan.weeks[0])?.number ?? 1)
  }, [plan, done, today])

  const windowStart = showAll ? 1 : Math.max(1, currentWeekNumber - 1)
  const windowEnd = showAll ? plan.weeks.length : currentWeekNumber + 3
  const hiddenBefore = plan.weeks.filter((w) => w.number < windowStart).length
  const hiddenAfter = plan.weeks.filter((w) => w.number > windowEnd).length

  const minutesLearnedLabel = formatMinutes(stats.doneMinutes)
  const endLabel = plan.endDate ? fmt(plan.endDate, { month: 'long', day: 'numeric' }) : null

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 pb-24">
      <header className="flex items-center justify-between gap-3">
        <Logo size="sm" />
        <div className="flex items-center gap-1">
          <GhostButton onClick={onReplan}>Replan</GhostButton>
          <GhostButton onClick={onStartOver} className="hover:!bg-rose-50 hover:!text-rose-600">
            Start over
          </GhostButton>
        </div>
      </header>

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="brand">
            {topic?.label} · {profile.level}
          </Chip>
          {profile.focus.map((f) => (
            <Chip key={f} tone="slate">
              {focusLabel(f)}
            </Chip>
          ))}
        </div>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-ink">
          {profile.goal ? profile.goal : `Your ${topic?.label} plan`}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {remainingSessions.length} session{remainingSessions.length === 1 ? '' : 's'} to go ·{' '}
          {formatMinutes(remainingMinutes)} left · {profile.daysPerWeek}× a week
          {endLabel && !finished ? ` · finishes around ${endLabel}` : ''}
        </p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Your progress">
        <Stat icon="⭐" value={xp.toLocaleString()} label="XP" tone="bg-amber-50" />
        <Stat
          icon="🔥"
          value={`${shownStreak} day${shownStreak === 1 ? '' : 's'}`}
          label={practicedToday(streak, today) ? 'streak · done today' : `streak · best ${streak.longest}`}
          tone="bg-orange-50"
        />
        <Stat icon="⏱" value={minutesLearnedLabel} label="learned" tone="bg-brand-50" />
        <Stat
          icon="✅"
          value={`${Math.round(stats.fraction * 100)}%`}
          label={`of ${formatMinutes(stats.totalMinutes)}`}
          tone="bg-emerald-50"
        />
      </section>

      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(stats.fraction * 100)}
        aria-label="Plan completion"
      >
        <div
          className="brand-gradient h-full rounded-full transition-all duration-500"
          style={{ width: `${stats.fraction * 100}%` }}
        />
      </div>

      {overdue.length > 0 && !finished && (
        <Card className="mt-6 border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-900">
                You have {overdue.length} session{overdue.length === 1 ? '' : 's'} behind schedule
              </p>
              <p className="mt-0.5 text-sm text-amber-800">
                That's normal. Replan moves everything unfinished to start today. What you've completed stays completed.
              </p>
            </div>
            <PrimaryButton onClick={onReplan} className="!px-4 !py-2 text-sm">
              Replan from today
            </PrimaryButton>
          </div>
        </Card>
      )}

      {finished ? (
        <Card className="mt-6 overflow-hidden border-0 brand-gradient p-6 text-white shadow-lg shadow-brand-300/50">
          <p className="text-2xl font-extrabold">Plan complete 🎉</p>
          <p className="mt-1 text-white/90">
            You finished {formatMinutes(stats.totalMinutes)} of {topic?.label}. Keep the momentum: build your next plan
            and your streak carries over.
          </p>
          <button
            type="button"
            onClick={onNewPlan}
            className="mt-4 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            Build my next plan
          </button>
        </Card>
      ) : (
        <section className="mt-8" aria-label="Up next">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            {next.kind === 'today' ? 'Today' : next.kind === 'doneToday' ? 'Done for today' : 'Up next'}
          </h2>
          {next.session ? (
            <div className="mt-2">
              {next.kind !== 'today' && (
                <p className="mb-2 text-sm text-slate-500">
                  {next.kind === 'doneToday'
                    ? `Nice work. ${followingSession ? `Your next session is ${dayLabel(followingSession.date)}.` : 'That was your last session.'}`
                    : `Your next session is ${dayLabel(next.session.date)}.`}
                </p>
              )}
              <SessionCard
                session={next.session}
                itemsById={plan.itemsById}
                done={isSessionDone(next.session, done)}
                onToggle={onToggleSession}
                focusFor={focusFor}
                hasFocus={profile.focus.length > 0}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nothing scheduled. Replan to set a new rhythm.</p>
          )}
        </section>
      )}

      <section className="mt-10" aria-label="Your schedule">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Schedule</h2>

        {hiddenBefore > 0 && (
          <GhostButton onClick={() => setShowAll(true)} className="mt-2">
            Show {hiddenBefore} earlier week{hiddenBefore === 1 ? '' : 's'}
          </GhostButton>
        )}

        <div className="mt-3 space-y-8">
          {plan.weeks
            .filter((w) => w.number >= windowStart && w.number <= windowEnd)
            .map((week) => {
              const sessionDays = week.days.filter((d) => d.session)
              const restDays = week.days.filter((d) => !d.session && !d.beforeStart)
              const block = blockAfterWeek.get(week.number)
              const isCurrent = week.number === currentWeekNumber
              return (
                <div key={week.number}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-bold text-ink">
                      Week {week.number}
                      {isCurrent && (
                        <Chip tone="brand" className="ml-2 align-middle">
                          This week
                        </Chip>
                      )}
                    </h3>
                    <span className="text-xs text-slate-400">{weekRange(week)}</span>
                  </div>

                  <ol className="mt-3 space-y-3">
                    {sessionDays.map((d) => {
                      const s = d.session
                      const isToday = sameDay(d.date, today)
                      const isOverdue = diffDays(d.date, today) < 0 && !isSessionDone(s, done)
                      return (
                        <li key={s.id} className="flex gap-3">
                          <div className="w-14 shrink-0 pt-4 text-right">
                            <p
                              className={`text-xs font-bold uppercase ${isToday ? 'text-brand-600' : 'text-slate-400'}`}
                            >
                              {fmt(d.date, { weekday: 'short' })}
                            </p>
                            <p className={`text-lg font-bold leading-tight ${isToday ? 'text-brand-600' : 'text-ink'}`}>
                              {d.date.getDate()}
                            </p>
                            <p className="text-[11px] text-slate-400">{fmt(d.date, { month: 'short' })}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            {s.id === next.session?.id ? (
                              <p className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 px-4 py-3 text-sm text-brand-700">
                                {isToday
                                  ? "That's today's session, shown at the top."
                                  : "That's your next session, shown at the top."}
                              </p>
                            ) : (
                              <>
                                {(isToday || isOverdue) && (
                                  <div className="mb-1.5 flex gap-1.5">
                                    {isToday && <Chip tone="brand">Today</Chip>}
                                    {isOverdue && <Chip tone="amber">Behind schedule</Chip>}
                                  </div>
                                )}
                                <SessionCard
                                  session={s}
                                  itemsById={plan.itemsById}
                                  done={isSessionDone(s, done)}
                                  onToggle={onToggleSession}
                                  focusFor={focusFor}
                                  hasFocus={profile.focus.length > 0}
                                  label={isOverdue ? 'overdue' : undefined}
                                />
                              </>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>

                  {restDays.length > 0 && (
                    <p className="mt-3 pl-[68px] text-xs text-slate-400">
                      Rest: {restDays.map((d) => fmt(d.date, { weekday: 'short' })).join(', ')}
                    </p>
                  )}

                  {block && (
                    <div className="mt-4">
                      <QuizCard
                        block={block}
                        status={quizStatus(block, plan, done, QUIZ_BANK)}
                        result={quizResults[block.id]}
                        onOpen={() => onOpenQuiz(block)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        {hiddenAfter > 0 && (
          <GhostButton onClick={() => setShowAll(true)} className="mt-6">
            Show {hiddenAfter} later week{hiddenAfter === 1 ? '' : 's'}
          </GhostButton>
        )}
        {showAll && plan.weeks.length > 6 && (
          <GhostButton onClick={() => setShowAll(false)} className="mt-6">
            Collapse to this week
          </GhostButton>
        )}
      </section>

      <p className="mt-12 text-center text-xs text-slate-400">Your progress is saved in this browser.</p>
    </div>
  )
}
