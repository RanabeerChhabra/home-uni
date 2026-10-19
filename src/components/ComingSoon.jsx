import Logo from './Logo.jsx'

export default function ComingSoon({ topicLabel, onBack }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <Logo size="md" className="mx-auto mb-16 justify-center" />
      <h1 className="text-2xl font-bold" style={{ color: 'var(--color-ink)' }}>
        {topicLabel} is coming soon
      </h1>
      <p className="mt-2 text-slate-500">
        We haven't curated this track yet. Finance is fully built out — try that one to see the full experience.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="brand-gradient mt-6 rounded-xl px-5 py-2.5 font-semibold text-white shadow-lg shadow-brand-300 transition-all hover:brightness-110"
      >
        Back to survey
      </button>
    </div>
  )
}
