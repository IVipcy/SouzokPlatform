'use client'

/**
 * 一覧の「残り」列。期限までの日数を出す。
 *
 * 「超過268日」「残り5日」と、頭に言葉を置く。
 * 数字だけ大きく出して「5日」とだけ書くと、見出しを見上げないと何の5日か分からず、
 * 超過側の「268日超過」と語順も揃っていなかった。1セルだけ見て読める形にする。
 *
 * 日数の数え方（暦日／営業日）は表によって違うので、計算済みの日数を受け取る。
 * 案件一覧は暦日（お客様に伝えた完了予定日なので実感に合う）、
 * タスク一覧・登記チームは営業日。
 */
export function RemainCell({ days, muted = false, warnAt = 2, size = 'md' }: {
  /** 残り日数。マイナスなら超過。null は期限なし */
  days: number | null
  /** 完了した行。急がせる意味がないので色を付けない */
  muted?: boolean
  /** これ以下の残り日数で琥珀にする（案件は14日、タスクは2営業日） */
  warnAt?: number
  size?: 'md' | 'lg'
}) {
  if (days === null) return <span className="text-[12px] text-gray-300">—</span>
  const num = size === 'lg' ? 'text-[19px]' : 'text-[16px]'
  if (muted) return <span className="text-[12px] text-gray-400">{days < 0 ? `超過${-days}日` : '—'}</span>
  if (days < 0) {
    return (
      <span className="inline-flex items-baseline gap-0.5 text-red-600 whitespace-nowrap">
        <span className="text-[10.5px] font-bold">超過</span>
        <span className={`${num} font-bold leading-none tabular-nums`}>{-days}</span>
        <span className="text-[10.5px] font-bold">日</span>
      </span>
    )
  }
  if (days === 0) return <span className="text-[14px] font-bold text-amber-700 leading-none">本日</span>
  return (
    <span className={`inline-flex items-baseline gap-0.5 whitespace-nowrap ${days <= warnAt ? 'text-amber-700' : 'text-gray-700'}`}>
      <span className="text-[10.5px] font-semibold">残り</span>
      <span className={`${num} font-bold leading-none tabular-nums`}>{days}</span>
      <span className="text-[10.5px] font-semibold">日</span>
    </span>
  )
}
