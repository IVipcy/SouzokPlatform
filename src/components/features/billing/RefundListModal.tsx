'use client'

// 返金の一覧（当月・KPIの返金額クリックで開く）。大層なレポートは作らず、
// いつ・どの案件・いくら・どんな理由で返金したかを一覧＋合計で見せるだけ。
import Link from 'next/link'
import Modal from '@/components/ui/Modal'

export type RefundEntry = {
  id: string
  caseId: string
  caseNumber: string
  dealName: string
  date: string
  amount: number     // 正の返金額
  reason: string
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`

export default function RefundListModal({ isOpen, onClose, entries, periodLabel }: {
  isOpen: boolean
  onClose: () => void
  entries: RefundEntry[]
  periodLabel: string
}) {
  const total = entries.reduce((s, e) => s + e.amount, 0)
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`返金一覧（${periodLabel}）`} maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-gray-500">{entries.length}件</span>
          <span className="ml-auto text-[13px] text-gray-500">返金合計 <span className="font-mono font-bold text-rose-600">▲{yen(total)}</span></span>
        </div>
        {entries.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-gray-400">この期間の返金はありません。</div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
            {entries.map(e => (
              <div key={e.id} className="px-3 py-2.5 grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                <span className="text-[12px] font-mono text-gray-400 w-16">{e.date?.slice(5) || '—'}</span>
                <div className="min-w-0">
                  <div className="text-[13px]">
                    <Link href={`/cases/${e.caseId}`} className="font-mono text-brand-700 hover:underline">{e.caseNumber}</Link>
                    <span className="text-gray-800"> {e.dealName}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{e.reason || '理由未記入'}</div>
                </div>
                <span className="text-[13px] font-mono font-semibold text-rose-600 whitespace-nowrap">▲{yen(e.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
