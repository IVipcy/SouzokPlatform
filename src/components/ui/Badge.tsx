// モダンSaaS風バッジ（Linear/Stripe系）：淡い背景＋同系の濃い文字、枠なし、状態は先頭に点。
// 低彩度で上品・色は役割で固定。角は控えめ(5px)。
type Tone = 'brand' | 'blue' | 'gray' | 'slate' | 'green' | 'amber' | 'red' | 'purple' | 'indigo' | 'teal' | 'plum' | 'cyan'
type Variant = 'dot' | 'solid' | 'soft'

type CommonProps = {
  variant?: Variant
  className?: string
  /** 状態列で幅をそろえたいときに最小幅(px)を指定 */
  minWidth?: number
}

// ① 任意のhex色で指定するパターン（既存API維持）
type ColorProps = CommonProps & { label: string; color: string; tone?: never }
// ② tone（役割の固定パレット）で指定するパターン
type ToneProps = CommonProps & { label: string; tone: Tone; color?: never }
type BadgeProps = ColorProps | ToneProps

// 役割ごとの低彩度パレット（bg=淡色 / fg=同系の濃い文字 / dot=点）
const TONE_HEX: Record<Tone, { bg: string; fg: string; dot: string }> = {
  gray:   { bg: '#F1F3F5', fg: '#5B6470', dot: '#9AA1AC' },
  slate:  { bg: '#EEF0F3', fg: '#4A5163', dot: '#6B7280' },
  amber:  { bg: '#FBF3E3', fg: '#92670F', dot: '#D99A2B' },
  green:  { bg: '#E8F3EC', fg: '#2A7355', dot: '#3A9B72' },
  red:    { bg: '#FBECEA', fg: '#A33E36', dot: '#CF4F44' },
  blue:   { bg: '#EAF0FB', fg: '#2B5099', dot: '#3A66C8' },
  brand:  { bg: '#EAF0FB', fg: '#2B5099', dot: '#3A66C8' },
  teal:   { bg: '#E2F1EF', fg: '#1F7A6B', dot: '#2E8A7B' },
  cyan:   { bg: '#E2F1EF', fg: '#1F7A6B', dot: '#2E8A7B' },
  indigo: { bg: '#ECEDFB', fg: '#3E45A0', dot: '#4A52A8' },
  purple: { bg: '#ECEDFB', fg: '#3E45A0', dot: '#4A52A8' },
  plum:   { bg: '#F4EBF3', fg: '#84416F', dot: '#8A4A78' },
}

// hex(任意色) → 淡背景＋同系文字に変換（CASE_STATUSES 等の色APIを上品な見た目に揃える）
function fromColor(color: string): { bg: string; fg: string; dot: string } {
  const c = color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color
  return { bg: `${c}16`, fg: c, dot: c }
}

export default function Badge(props: BadgeProps) {
  const { label, variant = 'dot', className = '', minWidth } = props
  const { bg, fg, dot } = 'tone' in props && props.tone ? TONE_HEX[props.tone] : fromColor((props as ColorProps).color)
  const style: React.CSSProperties = { backgroundColor: bg, color: fg, minWidth }

  if (variant === 'solid') {
    return (
      <span className={`inline-flex items-center justify-center rounded-[5px] px-2.5 py-0.5 text-[11px] font-semibold text-white ${className}`} style={{ backgroundColor: dot, minWidth }}>
        {label}
      </span>
    )
  }
  if (variant === 'soft') {
    return (
      <span className={`inline-flex items-center justify-center rounded-[5px] px-2.5 py-0.5 text-[11px] font-medium ${className}`} style={style}>
        {label}
      </span>
    )
  }
  // dot（既定）
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 rounded-[5px] px-2.5 py-0.5 text-[11px] font-medium ${className}`} style={style}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
      {label}
    </span>
  )
}
