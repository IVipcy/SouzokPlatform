'use client'

import Link from 'next/link'
import { ALERT_SEVERITY_STYLE } from '@/lib/alerts'
import { ALERT_SEVERITY_ORDER, type AlertSeverity } from '@/lib/alertRules'

export type AlertChip = { key: string; label: string; severity: AlertSeverity; href?: string; title?: string }

/**
 * 一覧の「アラート」列。案件一覧・相談案件一覧・未着手案件一覧で共通に使う。
 *
 * 案件名の下にアラートを積むと、件数ぶん行が伸びて高さがバラバラになり、案件名も埋もれる。
 * 独立した列に出して1行に固定し、重い順（クレーム→要注意→要確認）の先頭だけ文字で見せ、
 * 残りは「＋n」。隠れている中身はマウスを乗せれば全部出る。
 *
 * 幅は中の div で固定する。表が table-auto だと td の width が効かず、
 * 長いアラートが1つ入っただけで列がどこまでも広がってしまうため。
 * 160px は、一番長いアラート名（「オーダーシート 未完成」＝110px）＋バッジの余白＋「＋n」を
 * ブラウザで実測して決めた。これ以上広げても空くだけ。
 */
export function AlertCell({ chips }: { chips?: AlertChip[] }) {
  if (!chips || chips.length === 0) return <span className="text-gray-300">—</span>
  // 元データも重い順に並んでいるが、途中で組み替えられても崩れないようここでも並べ直す
  const sorted = [...chips].sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity])
  const [head, ...rest] = sorted
  const all = sorted.map(a => `・${a.label}`).join('\n')
  const chipCls = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap min-w-0 ${ALERT_SEVERITY_STYLE[head.severity].chip}`
  const body = (
    <>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-none" />
      <span className="truncate">{head.label}</span>
    </>
  )
  return (
    <div
      className="flex items-center gap-1 w-[160px]"
      title={chips.length > 1 ? `出ているアラート ${chips.length}件\n${all}` : (head.title ?? undefined)}
    >
      {head.href
        ? <Link href={head.href} title="クリックで該当箇所へ" className={`${chipCls} transition`}>{body}</Link>
        : <span className={chipCls}>{body}</span>}
      {rest.length > 0 && (
        <span className="flex-none text-[11px] font-semibold text-gray-500">＋{rest.length}</span>
      )}
    </div>
  )
}
