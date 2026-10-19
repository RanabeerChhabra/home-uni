// Small shared building blocks.

export function PrimaryButton({ className = '', disabled, children, ...rest }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`brand-gradient rounded-xl px-6 py-3 font-semibold text-white shadow-lg shadow-brand-300/60 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function GhostButton({ className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Chip({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} {...rest}>
      {children}
    </div>
  )
}
