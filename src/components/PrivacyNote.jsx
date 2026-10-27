import { useState } from 'react'
import { isOptedOut, setOptOut } from '../utils/analytics.js'

// Says plainly what is measured, and lets anyone switch it off and delete what was stored.
export default function PrivacyNote({ className = '' }) {
  const [open, setOpen] = useState(false)
  const [optedOut, setOptedOut] = useState(isOptedOut)
  const [busy, setBusy] = useState(false)

  async function change(value) {
    setBusy(true)
    await setOptOut(value)
    setOptedOut(value)
    setBusy(false)
  }

  return (
    <div className={`text-xs text-slate-400 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600"
      >
        Privacy
      </button>
      {open && (
        <div className="mx-auto mt-2 max-w-md space-y-2 text-left leading-relaxed text-slate-500">
          <p>
            home uni counts visits and which features get used, so it can be improved. There are no accounts or cookies,
            and nothing you type (like your goal) is ever sent. A random ID in this browser tells visits apart. Your
            plan and progress stay on your device.
          </p>
          <p>
            {optedOut ? 'Usage stats are off for this browser.' : 'You can turn this off and delete what was recorded.'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => change(!optedOut)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {optedOut ? 'Turn usage stats back on' : 'Opt out and delete my data'}
          </button>
        </div>
      )}
    </div>
  )
}
