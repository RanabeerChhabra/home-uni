import icon from '../assets/icon.png'

export default function Logo({ size = 'md', className = '' }) {
  const sizes = {
    sm: { icon: 'h-6', text: 'text-lg' },
    md: { icon: 'h-8', text: 'text-2xl' },
    lg: { icon: 'h-12', text: 'text-4xl' },
  }
  const s = sizes[size] ?? sizes.md

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={icon} alt="" className={`${s.icon} w-auto`} />
      <span className={`${s.text} font-semibold tracking-tight`} style={{ color: 'var(--color-ink)' }}>
        home uni
      </span>
    </div>
  )
}
