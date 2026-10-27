import { useState } from 'react'
import { formatMinutes, formatViews, timestamp, withStart } from '../utils/resources.js'
import { Chip } from './ui.jsx'

function Segment({ unit, item, done, focusLabels, background, onResourceClick }) {
  const isVideo = item.type === 'video'
  const href = unit.startSec ? withStart(item.url, unit.startSec) : item.url
  const split = unit.parts > 1
  const views = formatViews(item.views)

  return (
    <div className="min-w-0">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onResourceClick?.(unit, item)}
        onAuxClick={() => onResourceClick?.(unit, item)}
        className={`font-semibold leading-snug hover:underline ${done ? 'text-slate-400 line-through' : 'text-brand-700'}`}
      >
        {item.title}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <Chip tone={isVideo ? 'brand' : 'slate'}>{isVideo ? 'Video' : 'Article'}</Chip>
        {split && (
          <Chip tone="amber">
            Part {unit.part} of {unit.parts}
          </Chip>
        )}
        <span>{formatMinutes(unit.minutes)}</span>
        {split && (
          <span className="text-slate-400">
            {timestamp(unit.startSec)} → {timestamp(unit.endSec)}
          </span>
        )}
        {isVideo && item.channel && <span className="text-slate-400">· {item.channel}</span>}
        {isVideo && views && <span className="text-slate-400">· {views}</span>}
      </div>

      {unit.part === 1 && !done && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.description}</p>}
      {split && unit.part > 1 && !done && (
        <p className="mt-1.5 text-sm text-slate-500">
          Pick up where you left off. The link jumps to {timestamp(unit.startSec)}.
        </p>
      )}

      {focusLabels.length > 0 && !done && (
        <p className="mt-1.5 text-xs font-medium text-brand-600">Matches your focus: {focusLabels.join(', ')}</p>
      )}
      {background && !done && <p className="mt-1.5 text-xs font-medium text-slate-400">Essential background</p>}
    </div>
  )
}

export default function SessionCard({
  session,
  itemsById,
  done,
  onToggle,
  focusFor,
  hasFocus,
  label,
  onResourceClick,
}) {
  const [burst, setBurst] = useState(false)

  function toggle() {
    if (!done) {
      setBurst(true)
      setTimeout(() => setBurst(false), 800)
    }
    onToggle(session)
  }

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm transition-colors ${
        done
          ? 'border-emerald-200 bg-emerald-50/60'
          : label === 'overdue'
            ? 'border-amber-200 bg-white'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex gap-3">
        <div className="relative shrink-0 pt-0.5">
          <button
            type="button"
            onClick={toggle}
            aria-pressed={done}
            aria-label={done ? 'Mark this session as not done' : 'Mark this session as done'}
            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-base font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              burst ? 'scale-125' : 'scale-100'
            } ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent hover:border-brand-400 hover:text-brand-200'}`}
          >
            ✓
          </button>
          {burst && (
            <span className="pointer-events-none absolute -top-2 left-1/2 animate-float-up whitespace-nowrap text-xs font-bold text-emerald-600">
              +{session.minutes} XP
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          {session.units.map((unit) => (
            <Segment
              key={unit.id}
              unit={unit}
              item={itemsById.get(unit.itemId)}
              done={done}
              focusLabels={focusFor(unit.itemId)}
              background={hasFocus && focusFor(unit.itemId).length === 0}
              onResourceClick={onResourceClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
