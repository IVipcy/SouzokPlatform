'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ALERT_SEVERITY_STYLE } from '@/lib/alerts'
import { ALERT_SEVERITY_ORDER, type AlertSeverity } from '@/lib/alertRules'

export type AlertChip = { key: string; label: string; severity: AlertSeverity; href?: string; title?: string }

const CHIP_BASE = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap min-w-0'

/** アラート1件。飛び先があればリンクにして、押すとその作業ができる場所へ直行させる。 */
function Chip({ chip, className = '' }: { chip: AlertChip; className?: string }) {
  const cls = `${CHIP_BASE} ${ALERT_SEVERITY_STYLE[chip.severity].chip} ${className}`
  const body = (
    <>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-none" />
      <span className="truncate">{chip.label}</span>
    </>
  )
  if (!chip.href) return <span className={cls} title={chip.title}>{body}</span>
  return (
    <Link href={chip.href} className={`${cls} transition hover:brightness-95`} title={chip.title ?? 'クリックで該当箇所へ'}>
      {body}
    </Link>
  )
}

/**
 * 一覧の「アラート」列。案件一覧・相談案件一覧・未着手案件一覧で共通に使う。
 *
 * 案件名の下にアラートを積むと、件数ぶん行が伸びて高さがバラバラになり、案件名も埋もれる。
 * 独立した列に出して1行に固定し、重い順（クレーム→要注意→要確認）の先頭だけ文字で見せる。
 * 残りは「＋n」にマウスを乗せるとカードで出す。
 * カードの中の1件ずつもリンクなので、そこから直接その作業ができる場所へ飛べる。
 *
 * カードは position:fixed で出す。表の外枠が overflow-x-auto なので、
 * 普通に絶対配置すると下のほうの行のカードが枠に切られて読めなくなるため。
 *
 * 幅の上限は中の div で決める。表が table-auto だと td の width/max-width が効かず、
 * 長いアラートが1つ入っただけで列がどこまでも広がってしまうため。
 * 上限160pxは、一番長いアラート名（「オーダーシート 未完成」＝110px）＋バッジの余白＋「＋n」を
 * ブラウザで実測した値。固定ではなく上限なので、短いアラートしか無い列は中身ぶんまで縮む。
 */
export function AlertCell({ chips }: { chips?: AlertChip[] }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  // 「＋n」からカードへマウスを移す間に消えないよう、閉じるのを少し待つ。
  // enter/leave ではなく over/out を使うのは、カード内のバッジ間を移動しても
  // 開き直しで繋がるうえ、こちらは実挙動をスクリプトで検証できるため。
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  if (!chips || chips.length === 0) return <span className="text-gray-300">—</span>
  // 元データも重い順に並んでいるが、途中で組み替えられても崩れないようここでも並べ直す
  const sorted = [...chips].sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity])
  const [head, ...rest] = sorted

  const open = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    // 下に入りきらないときは上に出す（1件あたり約26px＋枠の余白）
    const h = rest.length * 26 + 16
    setPos({ left: r.left, top: window.innerHeight - r.bottom < h + 12 ? r.top - h - 6 : r.bottom + 6 })
  }
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setPos(null), 150)
  }

  return (
    <div className="flex items-center gap-1 max-w-[160px]">
      <Chip chip={head} />
      {rest.length > 0 && (
        <span
          ref={anchorRef}
          onMouseOver={open}
          onMouseOut={scheduleClose}
          className="flex-none inline-flex items-center px-1.5 py-0.5 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:border-gray-400 hover:text-gray-800"
          title={`ほかに${rest.length}件`}
        >
          ＋{rest.length}
        </span>
      )}
      {pos && rest.length > 0 && (
        <div
          onMouseOver={open}
          onMouseOut={scheduleClose}
          style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 60 }}
          className="bg-white border border-gray-300 rounded-md shadow-lg p-2 flex flex-col gap-1 items-start"
        >
          {rest.map(a => <Chip key={a.key} chip={a} className="max-w-[240px]" />)}
        </div>
      )}
    </div>
  )
}
