type BadgeProps = {
  label: string
  color: string
  variant?: 'dot' | 'solid'
}

export default function Badge({ label, color, variant = 'dot' }: BadgeProps) {
  if (variant === 'solid') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border"
      style={{ color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
