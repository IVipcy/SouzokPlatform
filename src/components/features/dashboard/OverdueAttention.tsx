'use client'

// 要対応バナー（要確認/要注意）＋遷移先サブタブ（請求/タスク）。
// 入金期日超過とタスク期日超過を1箇所に統合。タスクはマイページと同じ SystemTaskList を流用。
import { useState } from 'react'
import Link from 'next/link'
import { Receipt, ListChecks } from 'lucide-react'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import type { TaskRow } from '@/types'
import type { OverdueSeverity } from '@/lib/overdue'

export type OverdueBill = {
  id: string; caseId: string; caseName: string; typeLabel: string; firmLabel: string
  amount: number; dueDate: string; over: number; severity: OverdueSeverity
}
export type OverdueTaskItem = { task: TaskRow; severity: OverdueSeverity; over: number }

const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`

export default function OverdueAttention({ bills, tasks, currentMemberId }: {
  bills: OverdueBill[]; tasks: OverdueTaskItem[]; currentMemberId: string
}) {
  const [sev, setSev] = useState<OverdueSeverity | null>(null) // null=すべて
  const [kind, setKind] = useState<'bill' | 'task'>('bill')

  const cnt = (s: OverdueSeverity) => bills.filter(b => b.severity === s).length + tasks.filter(t => t.severity === s).length
  const nKakunin = cnt('kakunin'), nChui = cnt('chui')
  const hasAny = nKakunin + nChui > 0

  const fBills = (sev ? bills.filter(b => b.severity === sev) : bills)
    .slice().sort((a, b) => b.over - a.over)
  const fTasks = (sev ? tasks.filter(t => t.severity === sev) : tasks)
    .slice().sort((a, b) => b.over - a.over)

  // コンパクトなチップ型。0件＝グレー（押せない見た目）、1件以上で点灯＋赤丸件数。
  const Banner = ({ s, label, sub, count, activeBg }: { s: OverdueSeverity; label: string; sub: string; count: number; activeBg: string }) => {
    const active = count > 0
    return (
      <button type="button" disabled={!active} onClick={() => active && setSev(sev === s ? null : s)}
        className={`inline-flex items-center gap-2 rounded-lg pl-3 pr-2 py-1.5 text-left transition ${active ? (sev === s ? 'ring-2 ring-black/15' : '') : 'cursor-default'}`}
        style={{ background: active ? activeBg : '#ECEAE4' }} title={sub}>
        <span className={`text-[13px] font-bold leading-none ${active ? 'text-[#3a2600]' : 'text-[#9a978f]'}`}>{label}</span>
        <span className={`text-[10.5px] font-medium ${active ? 'text-[#5a3d00]' : 'text-[#aca9a0]'} hidden sm:inline`}>{sub}</span>
        <span className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[13px] font-bold flex-none" style={{ background: active ? '#E23B3B' : '#CFCCC4' }}>{count}</span>
      </button>
    )
  }

  const ovr = (o: number, s: OverdueSeverity) => (
    <span className="inline-flex items-baseline gap-0.5">
      <span className={`text-[20px] font-bold leading-none tabular-nums ${s === 'chui' ? 'text-[#C0392B]' : 'text-[#B5651D]'}`}>{o}</span>
      <span className="text-[10.5px] text-gray-500">日超過</span>
    </span>
  )

  return (
    <div className="mb-4">
      <div className="flex gap-2 flex-wrap items-center mb-2.5">
        <Banner s="kakunin" label="要確認案件" sub="5営業日超過" count={nKakunin} activeBg="#F7B733" />
        <Banner s="chui" label="要注意案件" sub="2週間以上超過" count={nChui} activeBg="#F5842A" />
        {!hasAny && <span className="text-[11px] text-gray-400">期日超過（5営業日〜）はありません</span>}
      </div>

      {hasAny && (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold text-gray-800">要対応一覧</span>
          <span className="text-[12px]" style={{ color: sev === 'chui' ? '#C0392B' : sev === 'kakunin' ? '#B5651D' : '#888' }}>
            {sev === 'kakunin' ? '要確認（5営業日超過）' : sev === 'chui' ? '要注意（2週間以上）' : 'すべて'}
          </span>
          {sev && <button type="button" onClick={() => setSev(null)} className="text-[11px] text-brand-600 hover:underline">絞り込み解除</button>}
        </div>
        <div className="flex gap-1.5 px-3 py-2 bg-gray-50">
          <button type="button" onClick={() => setKind('bill')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold ${kind === 'bill' ? 'bg-white text-brand-700 border border-gray-200 shadow-sm' : 'text-gray-500'}`}><Receipt className="w-4 h-4" />請求（入金期日）<span className="text-[11px] text-gray-400">{fBills.length}</span></button>
          <button type="button" onClick={() => setKind('task')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold ${kind === 'task' ? 'bg-white text-brand-700 border border-gray-200 shadow-sm' : 'text-gray-500'}`}><ListChecks className="w-4 h-4" />タスク（期日）<span className="text-[11px] text-gray-400">{fTasks.length}</span></button>
        </div>

        {kind === 'bill' ? (
          <div className="overflow-x-auto">
            {fBills.length === 0 ? <div className="py-6 text-center text-[12px] text-gray-300">該当なし</div> : (
              <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 640 }}>
                <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">請求</th>
                    <th className="px-3 py-2 text-right font-bold whitespace-nowrap">金額</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">入金期日</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">超過</th>
                    <th className="px-3 py-2 text-center font-bold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fBills.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 font-medium text-gray-800">{b.caseName || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{b.firmLabel && <span className="text-[10px] mr-1 px-1 py-0.5 rounded bg-gray-100 text-gray-600">{b.firmLabel}</span>}{b.typeLabel}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{yen(b.amount)}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 whitespace-nowrap">{b.dueDate}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{ovr(b.over, b.severity)}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <Link href={`/billing?case=${b.caseId}&invoice=${b.id}`} className="inline-flex items-center px-2.5 py-1 rounded-md text-[11.5px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50">入金確認</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="p-2">
            <SystemTaskList tasks={fTasks.map(t => t.task)} title="" emptyText="該当なし" showCase includeCompleted={false} currentMemberId={currentMemberId} showMeta showRemain />
          </div>
        )}
      </div>
      )}
    </div>
  )
}
