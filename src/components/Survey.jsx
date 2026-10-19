import { useState } from 'react'
import { TOPICS, LEVELS } from '../data/curriculum.js'
import Logo from './Logo.jsx'

const REASONS = ['Career switch', 'Curiosity', 'Upskilling for current job']
const SESSION_LENGTHS = ['15 min', '30 min', '1 hr+']

function OptionButton({ selected, onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
        selected
          ? 'border-brand-500 bg-brand-50 shadow-sm shadow-brand-200'
          : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:shadow-sm'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      style={selected ? { color: 'var(--color-ink)' } : undefined}
    >
      {children}
    </button>
  )
}

export default function Survey({ onComplete }) {
  const [topic, setTopic] = useState(null)
  const [level, setLevel] = useState(null)
  const [reason, setReason] = useState(null)
  const [customReason, setCustomReason] = useState('')
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [sessionLength, setSessionLength] = useState(null)

  const canSubmit = topic && level

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onComplete({
      topic,
      level,
      reason: reason === 'Other' ? customReason.trim() : reason,
      daysPerWeek,
      sessionLength,
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Logo size="md" className="mb-10" />

      <form onSubmit={handleSubmit} className="space-y-10">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
            Let's build your curriculum
          </h1>
          <p className="mt-1 text-slate-500">A few questions, then we'll lay out your path.</p>
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
            What do you want to learn?
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TOPICS.map((t) => (
              <OptionButton key={t.id} selected={topic === t.id} onClick={() => setTopic(t.id)}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.label}</span>
                  {!t.available && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{t.blurb}</p>
              </OptionButton>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
            What's your current level?
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {LEVELS.map((l) => (
              <OptionButton key={l} selected={level === l} onClick={() => setLevel(l)}>
                <span className="font-semibold">{l}</span>
              </OptionButton>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
            Why are you learning this? <span className="font-normal text-slate-400">(optional)</span>
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REASONS.map((r) => (
              <OptionButton key={r} selected={reason === r} onClick={() => setReason(r)}>
                {r}
              </OptionButton>
            ))}
            <OptionButton selected={reason === 'Other'} onClick={() => setReason('Other')}>
              Other
            </OptionButton>
          </div>
          {reason === 'Other' && (
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Tell us why..."
              className="mt-3 w-full rounded-xl border-2 border-slate-200 px-4 py-2 text-slate-700 focus:border-brand-500 focus:outline-none"
            />
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
            How many days a week can you commit?{' '}
            <span className="font-normal text-slate-400">({daysPerWeek}/week)</span>
          </legend>
          <div className="grid grid-cols-7 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDaysPerWeek(n)}
                className={`rounded-xl border-2 py-2 text-center font-semibold transition-all ${
                  daysPerWeek === n
                    ? 'border-brand-500 bg-brand-50 shadow-sm shadow-brand-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200'
                }`}
                style={daysPerWeek === n ? { color: 'var(--color-ink)' } : undefined}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
            Time per session <span className="font-normal text-slate-400">(optional)</span>
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {SESSION_LENGTHS.map((s) => (
              <OptionButton key={s} selected={sessionLength === s} onClick={() => setSessionLength(s)}>
                {s}
              </OptionButton>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full rounded-xl py-3.5 font-semibold text-white shadow-lg transition-all ${
            canSubmit
              ? 'brand-gradient shadow-brand-300 hover:brightness-110 active:scale-[0.99]'
              : 'cursor-not-allowed bg-slate-200 text-slate-400 shadow-none'
          }`}
        >
          Build my curriculum
        </button>
      </form>
    </div>
  )
}
