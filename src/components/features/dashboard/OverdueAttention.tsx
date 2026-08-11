'use client'

// 要対応バナー（要確認/要注意）— マイページ上部中央に配置。
// バナーをクリックすると /my/overdue?sev=xxx へ遷移し、そこで詳細を確認する（同ページ内展開は廃止）。
import { useState } from 'react'
import Link from 'next/link'
import { HelpCircle } from 'lucide-react'
import AlertDefinitionModal from './AlertDefinitionModal'
import type { TaskRow } from '@/types'
import type { OverdueSeverity } from '@/lib/overdue'
import type { CaseStateAlert } from '@/lib/caseStateAlerts'

export type OverdueBill = {
  id: string; caseId: string; caseName: string; typeLabel: string; firmLabel: string
  amount: number; dueDate: string; over: number; severity: OverdueSeverity
}
export type OverdueTaskItem = { task: TaskRow; severity: OverdueSeverity; over: number }

export default function OverdueAttention({ bills, tasks, caseAlerts = [], hrefBase = '/my/overdue' }: {
  bills: OverdueBill[]; tasks: OverdueTaskItem[]; currentMemberId: string
  /** 案件アラート（管理担当未アサイン等・レコード無しの計算アラート） */
  caseAlerts?: CaseStateAlert[]
  /** バナー遷移先のベースURL（sev クエリを付加）。デフォルト=個人スコープの /my/overdue。チーム版は /dashboard/team/{id}/overdue を渡す */
  hrefBase?: string
}) {
  // 条件を思い出すためのポップアップ。定義は alertRules.ts の1か所だけなので画面と資料がずれない。
  const [defOpen, setDefOpen] = useState(false)
  // 数えるのは「案件の数」。1つの案件に何個アラートが出ていても1件で、重いほうに寄せる。
  // 進捗管理ボードの色件数（要注意/要確認）と同じ数え方にして、画面どうしで数字が食い違わないようにする。
  const worst = new Map<string, OverdueSeverity>()
  const put = (caseId: string, s: OverdueSeverity) => {
    if (s === 'chui' || !worst.has(caseId)) worst.set(caseId, s === 'chui' ? 'chui' : (worst.get(caseId) ?? s))
  }
  for (const b of bills) put(b.caseId, b.severity)
  for (const t of tasks) put(t.task.case_id, t.severity)
  for (const a of caseAlerts) put(a.caseId, a.severity)
  const nKakunin = [...worst.values()].filter(v => v === 'kakunin').length
  const nChui = [...worst.values()].filter(v => v === 'chui').length
  const hasAny = nKakunin + nChui > 0

  // バナー（1件以上で点灯＋赤丸件数・リンクで /my/overdue?sev=xxx へ遷移）
  const Banner = ({ s, label, count, activeBg }: { s: OverdueSeverity; label: string; count: number; activeBg: string }) => {
    const active = count > 0
    const inner = (
      <>
        <span className={`text-[13.5px] font-bold leading-none ${active ? 'text-[#3a2600]' : 'text-[#9a978f]'}`}>{label}</span>
        <span className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[13.5px] font-bold flex-none" style={{ background: active ? '#E23B3B' : '#CFCCC4' }}>{count}</span>
      </>
    )
    const cls = 'inline-flex items-center justify-between gap-3 rounded-lg px-4 py-2 text-left transition min-w-[150px]'
    if (!active) return <span className={`${cls} cursor-default`} style={{ background: '#ECEAE4' }}>{inner}</span>
    const sep = hrefBase.includes('?') ? '&' : '?'
    return <Link href={`${hrefBase}${sep}sev=${s}`} className={`${cls} hover:opacity-90`} style={{ background: activeBg }}>{inner}</Link>
  }

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <Banner s="kakunin" label="要確認案件" count={nKakunin} activeBg="#F7B733" />
      <Banner s="chui" label="要注意案件" count={nChui} activeBg="#F5842A" />
      {!hasAny && <span className="text-[11px] text-gray-400">期日超過はありません</span>}
      <button
        type="button"
        onClick={() => setDefOpen(true)}
        className="inline-flex items-center gap-1 text-[11.5px] text-brand-600 hover:text-brand-700 border-b border-dotted border-brand-400"
        title="どういう条件でアラートが出るか"
      >
        <HelpCircle className="w-3.5 h-3.5" strokeWidth={2} />アラート定義
      </button>
      <AlertDefinitionModal isOpen={defOpen} onClose={() => setDefOpen(false)} />
    </div>
  )
}
