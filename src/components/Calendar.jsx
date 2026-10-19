import { useState } from 'react'
import { POINTS_PER_ITEM } from '../utils/streak.js'
import Logo from './Logo.jsx'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ResourceCard({ item, done, onToggleDone }) {
  const [showBurst, setShowBurst] = useState(false)

  function handleToggle() {
    if (!done) {
      setShowBurst(true)
      setTimeout(() => setShowBurst(false), 700)
    }
    onToggleDone(item.id)
  }

  return (
    <div
      className={`rounded-xl border p-3 text-sm shadow-sm transition-all ${
        done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="relative mt-0.5 shrink-0">
          <button
            type="button"
            onClick={handleToggle}
            aria-pressed={done}
            aria-label={done ? 'Mark as not done' : 'Mark as done'}
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
              showBurst ? 'scale-125' : 'scale-100'
            } ${
              done
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-slate-300 bg-white text-transparent hover:border-brand-400'
            }`}
          >
            ✓
          </button>
          {showBurst && (
            <span className="pointer-events-none absolute -top-1 left-1/2 animate-float-up text-xs font-bold text-emerald-600">
              +{POINTS_PER_ITEM}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-semibold hover:underline ${done ? 'text-emerald-800 line-through' : 'text-brand-600'}`}
          >
            {item.title}
          </a>
          <p className={`mt-0.5 text-xs ${done ? 'text-emerald-700' : 'text-slate-500'}`}>
            {item.type === 'video' ? 'Video' : 'Article'} · ~{item.estMinutes} min
          </p>
          <p className={`mt-1 text-xs ${done ? 'text-emerald-700' : 'text-slate-600'}`}>{item.description}</p>
        </div>
      </div>
    </div>
  )
}

function StatPill({ emoji, label }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold shadow-sm" style={{ color: 'var(--color-ink)' }}>
      <span>{emoji}</span>
      <span>{label}</span>
    </div>
  )
}

export default function Calendar({
  schedule,
  doneItems,
  onToggleDone,
  topicLabel,
  level,
  totalItems,
  points,
  streak,
  onStartOver,
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const completedCount = doneItems.size
  const pct = totalItems === 0 ? 0 : Math.round((completedCount / totalItems) * 100)

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <Logo size="sm" />

      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-ink)' }}>
              {topicLabel} · {level}
            </h1>
            <p className="mt-1 text-slate-500">
              {schedule.length} week{schedule.length === 1 ? '' : 's'} of resources, laid out for you.
            </p>
          </div>
          <button
            type="button"
            onClick={onStartOver}
            className="shrink-0 text-sm text-slate-400 hover:text-brand-600 hover:underline"
          >
            Start over
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatPill emoji="⭐" label={`${points} pts`} />
          <StatPill emoji="🔥" label={`${streak.current} day streak`} />
          <StatPill emoji="🏆" label={`Best: ${streak.longest}`} />
          <StatPill emoji="✅" label={`${completedCount}/${totalItems} done`} />
        </div>

        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="brand-gradient h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-6">
        {schedule.map((week) => (
          <div key={week.weekNumber}>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Week {week.weekNumber}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
              {week.days.map((day, i) => {
                const isToday = day.date.getTime() === today.getTime()
                return (
                  <div key={i} className="min-h-[6rem]">
                    <div
                      className={`mb-2 text-xs font-semibold ${
                        isToday ? 'text-brand-600' : 'text-slate-400'
                      }`}
                    >
                      {DAY_LABELS[i]} · {formatDate(day.date)}
                    </div>
                    <div className="space-y-2">
                      {day.items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-300">
                          Rest day
                        </div>
                      ) : (
                        day.items.map((item) => (
                          <ResourceCard
                            key={item.id}
                            item={item}
                            done={doneItems.has(item.id)}
                            onToggleDone={onToggleDone}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
