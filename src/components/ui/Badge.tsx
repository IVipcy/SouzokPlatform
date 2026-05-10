type Tone = 'brand' | 'gray' | 'green' | 'amber' | 'red' | 'purple' | 'cyan'
type Variant = 'dot' | 'solid' | 'soft'

type CommonProps = {
  variant?: Variant
  className?: string
}

// ① 任意のhex色で指定するパターン（既存API維持）
type ColorProps = CommonProps & {
  label: string
  color: string  // hex like #2563EB
  tone?: never
}

// ② tone（半固定パレット）で指定するパターン
type ToneProps = CommonProps & {
  label: string
  tone: Tone
  color?: never
}

type BadgeProps = ColorProps | ToneProps

const TONE_STYLES: Record<Tone, { dot: string; solid: string; soft: string }> = {
  brand:  { dot: 'border-brand-200 bg-brand-50 text-brand-700',     solid: 'bg-brand-600 text-white',  soft: 'bg-brand-100 text-brand-800' },
  gray:   { dot: 'border-gray-200 bg-gray-50 text-gray-700',        solid: 'bg-gray-600 text-white',   soft: 'bg-gray-100 text-gray-800' },
  green:  { dot: 'border-emerald-200 bg-emerald-50 text-emerald-700', solid: 'bg-emerald-600 text-white', soft: 'bg-emerald-100 text-emerald-800' },
  amber:  { dot: 'border-amber-200 bg-amber-50 text-amber-700',     solid: 'bg-amber-600 text-white',  soft: 'bg-amber-100 text-amber-800' },
  red:    { dot: 'border-red-200 bg-red-50 text-red-700',           solid: 'bg-red-600 text-white',    soft: 'bg-red-100 text-red-800' },
  purple: { dot: 'border-purple-200 bg-purple-50 text-purple-700',  solid: 'bg-purple-600 text-white', soft: 'bg-purple-100 text-purple-800' },
  cyan:   { dot: 'border-cyan-200 bg-cyan-50 text-cyan-700',        solid: 'bg-cyan-600 text-white',   soft: 'bg-cyan-100 text-cyan-800' },
}

const TONE_DOT_COLOR: Record<Tone, string> = {
  brand: 'bg-brand-600',
  gray: 'bg-gray-600',
  green: 'bg-emerald-600',
  amber: 'bg-amber-600',
  red: 'bg-red-600',
  purple: 'bg-purple-600',
  cyan: 'bg-cyan-600',
}

export default function Badge(props: BadgeProps) {
  const { label, variant = 'dot', className = '' } = props

  // toneベース
  if ('tone' in props && props.tone) {
    const tone = props.tone
    const style = TONE_STYLES[tone]
    if (variant === 'solid') {
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.solid} ${className}`}>
          {label}
        </span>
      )
    }
    if (variant === 'soft') {
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.soft} ${className}`}>
          {label}
        </span>
      )
    }
    // dot variant
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.dot} ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT_COLOR[tone]}`} />
        {label}
      </span>
    )
  }

  // 既存hex colorベース（既存呼び出し維持）
  const { color } = props
  if (variant === 'solid') {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${className}`}
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${className}`}
      style={{ color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
