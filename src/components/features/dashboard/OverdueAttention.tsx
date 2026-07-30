'use client'

// 要対応バナー（要確認/要注意）— マイページ上部中央に配置。
// バナーをクリックすると /my/overdue?sev=xxx へ遷移し、そこで詳細を確認する（同ページ内展開は廃止）。
import Link from 'next/link'
import type { TaskRow } from '@/types'
import type { OverdueSeverity } from '@/lib/overdue'

export type OverdueBill = {
  id: string; caseId: string; caseName: string; typeLabel: string; firmLabel: string
  amount: number; dueDate: string; over: number; severity: OverdueSeverity
}
export type OverdueTaskItem = { task: TaskRow; severity: OverdueSeverity; over: number }

export default function OverdueAttention({ bills, tasks }: {
  bills: OverdueBill[]; tasks: OverdueTaskItem[]; currentMemberId: string
}) {
  const cnt = (s: OverdueSeverity) => bills.filter(b => b.severity === s).length + tasks.filter(t => t.severity === s).length
  const nKakunin = cnt('kakunin'), nChui = cnt('chui')
  const hasAny = nKakunin + nChui > 0

  // バナー（1件以上で点灯＋赤丸件数・リンクで /my/overdue?sev=xxx へ遷移）
  const Banner = ({ s, label, count, activeBg }: { s: OverdueSeverity; label: string; count: number; activeBg: string }) => {
    const active = count > 0
    const inner = (
      <>
        <span className={`text-[13px] font-bold leading-none ${active ? 'text-[#3a2600]' : 'text-[#9a978f]'}`}>{label}</span>
        <span className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[13px] font-bold flex-none" style={{ background: active ? '#E23B3B' : '#CFCCC4' }}>{count}</span>
      </>
    )
    const cls = 'inline-flex items-center gap-2 rounded-lg pl-3 pr-2 py-1.5 text-left transition'
    if (!active) return <span className={`${cls} cursor-default`} style={{ background: '#ECEAE4' }}>{inner}</span>
    return <Link href={`/my/overdue?sev=${s}`} className={`${cls} hover:opacity-90`} style={{ background: activeBg }}>{inner}</Link>
  }

  return (
    <div className="mb-4 flex gap-2 flex-wrap items-center justify-center">
      <Banner s="kakunin" label="要確認案件" count={nKakunin} activeBg="#F7B733" />
      <Banner s="chui" label="要注意案件" count={nChui} activeBg="#F5842A" />
      {!hasAny && <span className="text-[11px] text-gray-400">期日超過はありません</span>}
    </div>
  )
}
