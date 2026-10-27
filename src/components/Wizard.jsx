import { useEffect, useMemo, useRef, useState } from 'react'
import { CURRICULUM, LEVELS, TOPICS } from '../data/curriculum.js'
import videoMeta from '../data/videoMeta.json'
import { buildPlan } from '../utils/plan.js'
import { enrich, formatMinutes } from '../utils/resources.js'
import { availableFocusAreas, tailorItems } from '../utils/tailor.js'
import { startOfDay, toKey } from '../utils/dates.js'
import { track } from '../utils/analytics.js'
import Logo from './Logo.jsx'
import PrivacyNote from './PrivacyNote.jsx'
import { Chip, GhostButton, PrimaryButton } from './ui.jsx'

const LEVEL_BLURBS = {
  Beginner: 'New to this. Start from the ground up.',
  Intermediate: 'I know the basics and want real depth.',
  Advanced: 'I want rigorous, expert-level material.',
}

const REASONS = [
  'Switch careers',
  'Level up at my job',
  'Start a project or business',
  'Prepare for school or exams',
  'Personal growth',
  'Pure curiosity',
]

const FORMATS = [
  { id: 'videos', label: 'Mostly videos', hint: 'Lectures, talks and explainers' },
  { id: 'mix', label: 'A mix', hint: 'Whatever teaches each idea best' },
  { id: 'reading', label: 'Mostly reading', hint: 'Articles, guides and short clips' },
]

const SESSION_LENGTHS = [15, 30, 45, 60, 90]
const MAX_FOCUS = 2
const NO_ITEMS = []

function Choice({ selected, onClick, title, hint, right }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-2xl border-2 px-4 py-3.5 text-left transition-all ${
        selected
          ? 'border-brand-500 bg-brand-50 shadow-sm shadow-brand-200'
          : 'border-slate-200 bg-white hover:border-brand-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink">{title}</span>
        {right}
      </div>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
    </button>
  )
}

function Pill({ selected, onClick, children, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
        selected
          ? 'border-brand-500 bg-brand-50 text-ink'
          : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200'
      }`}
    >
      {children}
    </button>
  )
}

export default function Wizard({ onComplete, canCancel, onCancel }) {
  const [step, setStep] = useState(0)
  const [topic, setTopic] = useState(null)
  const [level, setLevel] = useState(null)
  const [focus, setFocus] = useState([])
  const [goal, setGoal] = useState('')
  const [reasons, setReasons] = useState([])
  const [format, setFormat] = useState('mix')
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [sessionMinutes, setSessionMinutes] = useState(30)

  const items = topic && level ? CURRICULUM[topic][level] : NO_ITEMS
  const focusAreas = useMemo(() => (items.length ? availableFocusAreas(topic, items) : NO_ITEMS), [topic, items])

  // Changing topic or level can invalidate earlier focus picks, so only count the valid ones.
  const activeFocus = useMemo(() => focus.filter((id) => focusAreas.some((a) => a.id === id)), [focus, focusAreas])

  const [startDate] = useState(() => startOfDay(new Date()))
  const preview = useMemo(() => {
    if (!items.length) return null
    const tailored = tailorItems(items, { focus: activeFocus, format, minutesOf: (i) => enrich(i, videoMeta).minutes })
    const plan = buildPlan({ items: tailored, capacity: sessionMinutes, daysPerWeek, startDate, meta: videoMeta })
    return { tailored, plan }
  }, [items, activeFocus, format, sessionMinutes, daysPerWeek, startDate])

  const steps = ['topic', 'level', 'focus', 'goal', 'format', 'pace', 'review']
  const current = steps[step]
  const last = steps.length - 1

  const direction = useRef('next')
  const next = () => {
    direction.current = 'next'
    setStep((s) => Math.min(last, s + 1))
  }
  const back = () => {
    direction.current = 'back'
    setStep((s) => Math.max(0, s - 1))
  }

  // One event per step shown, which is what the setup drop-off chart is built from.
  useEffect(() => {
    track('wizard_step', { step: steps[step], idx: step, dir: direction.current })
  }, [step])
  const pickAndAdvance = (setter, value) => {
    setter(value)
    setTimeout(next, 180)
  }

  const canContinue = (() => {
    if (current === 'topic') return Boolean(topic)
    if (current === 'level') return Boolean(level)
    return true
  })()

  // Build on the valid selection so stale picks from a previous topic never linger.
  const toggleFocus = (id) =>
    setFocus(
      activeFocus.includes(id)
        ? activeFocus.filter((x) => x !== id)
        : activeFocus.length >= MAX_FOCUS
          ? [...activeFocus.slice(1), id]
          : [...activeFocus, id],
    )
  const toggleReason = (r) => setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]))

  function finish() {
    onComplete(
      {
        topic,
        level,
        focus: activeFocus,
        goal: goal.trim(),
        reasons,
        format,
        daysPerWeek,
        sessionMinutes,
        startDate: toKey(new Date()),
        archived: [],
      },
      {
        sessions: preview.plan.sessions.length,
        totalMin: preview.plan.totalMinutes,
      },
    )
  }

  const topicLabel = TOPICS.find((t) => t.id === topic)?.label
  const pct = Math.round(((step + 1) / steps.length) * 100)

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <Logo size="md" />
        {canCancel && (
          <GhostButton onClick={onCancel} className="!px-3">
            Cancel
          </GhostButton>
        )}
      </div>

      <div
        className="mt-8"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Setup progress"
      >
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="brand-gradient h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-400">
          Step {step + 1} of {steps.length}
        </p>
      </div>

      <div className="mt-6 flex-1">
        {current === 'topic' && (
          <section>
            <h1 className="text-2xl font-bold text-ink">What do you want to learn?</h1>
            <p className="mt-1 text-slate-500">Pick one to start. You can build another plan later.</p>
            <div className="mt-6 grid gap-3">
              {TOPICS.map((t) => (
                <Choice
                  key={t.id}
                  selected={topic === t.id}
                  onClick={() => pickAndAdvance(setTopic, t.id)}
                  title={t.label}
                  hint={t.blurb}
                />
              ))}
            </div>
          </section>
        )}

        {current === 'level' && (
          <section>
            <h1 className="text-2xl font-bold text-ink">Where are you with {topicLabel}?</h1>
            <p className="mt-1 text-slate-500">
              Be honest. The right level is the one that stretches you without losing you.
            </p>
            <div className="mt-6 grid gap-3">
              {LEVELS.map((l) => (
                <Choice
                  key={l}
                  selected={level === l}
                  onClick={() => pickAndAdvance(setLevel, l)}
                  title={l}
                  hint={LEVEL_BLURBS[l]}
                />
              ))}
            </div>
          </section>
        )}

        {current === 'focus' && (
          <section>
            <h1 className="text-2xl font-bold text-ink">What do you most want out of this?</h1>
            <p className="mt-1 text-slate-500">
              Pick up to {MAX_FOCUS}. Your plan is built around these, with the essentials always included.
            </p>
            <div className="mt-6 grid gap-3">
              {focusAreas.map((a) => (
                <Choice
                  key={a.id}
                  selected={activeFocus.includes(a.id)}
                  onClick={() => toggleFocus(a.id)}
                  title={a.label}
                  hint={a.hint}
                  right={<Chip tone="slate">{a.count} resources</Chip>}
                />
              ))}
              <Choice
                selected={activeFocus.length === 0}
                onClick={() => setFocus([])}
                title="No preference"
                hint="Give me the whole curriculum for this level."
              />
            </div>
          </section>
        )}

        {current === 'goal' && (
          <section>
            <h1 className="text-2xl font-bold text-ink">What would success look like?</h1>
            <p className="mt-1 text-slate-500">
              Optional, but it's the thing you'll see at the top of your plan when motivation dips.
            </p>
            <label htmlFor="goal" className="sr-only">
              Your goal
            </label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, 240))}
              rows={3}
              placeholder={
                topic === 'finance'
                  ? 'e.g. Open a Roth IRA and understand what I’m investing in'
                  : topic === 'coding'
                    ? 'e.g. Build and deploy my first web app'
                    : 'In a sentence or two…'
              }
              className="mt-5 w-full resize-none rounded-2xl border-2 border-slate-200 px-4 py-3 text-ink placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{goal.length}/240</p>
            <p className="mt-4 text-sm font-semibold text-ink">Why now?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <Pill key={r} selected={reasons.includes(r)} onClick={() => toggleReason(r)}>
                  {r}
                </Pill>
              ))}
            </div>
          </section>
        )}

        {current === 'format' && (
          <section>
            <h1 className="text-2xl font-bold text-ink">How do you like to learn?</h1>
            <p className="mt-1 text-slate-500">This shapes which resources make the cut. Essentials always stay in.</p>
            <div className="mt-6 grid gap-3">
              {FORMATS.map((f) => (
                <Choice
                  key={f.id}
                  selected={format === f.id}
                  onClick={() => setFormat(f.id)}
                  title={f.label}
                  hint={f.hint}
                />
              ))}
            </div>
          </section>
        )}

        {current === 'pace' && (
          <section>
            <h1 className="text-2xl font-bold text-ink">What pace is realistic?</h1>
            <p className="mt-1 text-slate-500">
              A plan you can keep beats an ambitious one you drop. We split long videos so every session is finishable.
            </p>

            <p className="mt-6 text-sm font-semibold text-ink">Days per week</p>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <Pill
                  key={n}
                  selected={daysPerWeek === n}
                  onClick={() => setDaysPerWeek(n)}
                  label={`${n} days per week`}
                >
                  {n}
                </Pill>
              ))}
            </div>

            <p className="mt-6 text-sm font-semibold text-ink">Time per session</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SESSION_LENGTHS.map((m) => (
                <Pill key={m} selected={sessionMinutes === m} onClick={() => setSessionMinutes(m)}>
                  {m} min
                </Pill>
              ))}
            </div>

            {preview && (
              <div className="mt-8 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900">
                <p className="font-semibold">
                  {preview.plan.sessions.length} sessions · about {Math.max(1, preview.plan.weeks.length)} week
                  {preview.plan.weeks.length === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-brand-800">
                  {formatMinutes(preview.plan.totalMinutes)} of learning across {preview.tailored.length} resources.
                </p>
              </div>
            )}
          </section>
        )}

        {current === 'review' && preview && (
          <section>
            <h1 className="text-2xl font-bold text-ink">Your plan is ready</h1>
            <p className="mt-1 text-slate-500">Here's what we built from your answers.</p>

            <dl className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
              <Row label="Topic" value={`${topicLabel} · ${level}`} />
              <Row
                label="Focus"
                value={
                  activeFocus.length
                    ? focusAreas
                        .filter((a) => activeFocus.includes(a.id))
                        .map((a) => a.label)
                        .join(' + ')
                    : 'The full curriculum'
                }
              />
              {goal.trim() && <Row label="Goal" value={goal.trim()} />}
              <Row label="Rhythm" value={`${daysPerWeek}× a week, about ${sessionMinutes} min`} />
              <Row
                label="Size"
                value={`${preview.plan.sessions.length} sessions · ${formatMinutes(preview.plan.totalMinutes)} · ${preview.plan.weeks.length} weeks`}
              />
              <Row label="Checkpoints" value="A short quiz about every two weeks" />
            </dl>

            <p className="mt-6 text-sm font-semibold text-ink">It starts with</p>
            <ol className="mt-2 space-y-2">
              {preview.plan.items.slice(0, 3).map((i, idx) => (
                <li key={i.id} className="flex gap-3 text-sm text-slate-600">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {idx + 1}
                  </span>
                  <span>{i.title}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <GhostButton onClick={back} className={step === 0 ? 'invisible' : ''}>
          Back
        </GhostButton>
        {current === 'review' ? (
          <PrimaryButton onClick={finish}>Start my plan</PrimaryButton>
        ) : (
          <PrimaryButton onClick={next} disabled={!canContinue}>
            Continue
          </PrimaryButton>
        )}
      </div>

      <PrivacyNote className="mt-8" />
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="w-24 shrink-0 text-slate-400">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}
