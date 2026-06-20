'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Banknote } from 'lucide-react'

export type PayCheckSentRow = {
  requestId: string
  case_id: string
  case_number: string
  deal_name: string
  amount: number
  confirmerName: string | null
  requestedDate: string
  status: '依頼中' | '確認済'
  resultNote: string | null
  confirmedDate: string | null
  autoClosed: boolean
}

type Props = {
  rows: PayCheckSentRow[]
}

const STATUS_BADGE: Record<string, string> = {
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

// 管理担当が出した「入金状況確認依頼」の状態・結果の一覧（発信は請求タブから行う）。
export default function PaymentCheckSentTab({ rows }: Props) {
  const [filter, setFilter] = useState<'all' | '依頼中' | '確認済'>('依頼中')
  const counts = {
    依頼中: rows.filter(r => r.status === '依頼中').length,
    確認済: rows.filter(r => r.status === '確認済').length,
  }
  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <Banknote className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">入金状況確認</h3>
        <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <FilterChip label="すべて" active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label="依頼中" active={filter === '依頼中'} onClick={() => setFilter('依頼中')} count={counts.依頼中} />
          <FilterChip label="確認済" active={filter === '確認済'} onClick={() => setFilter('確認済')} count={counts.確認済} />
        </div>
        <span className="ml-auto text-[11px] text-gray-400">発信は請求・入金管理タブから。ここでは結果を確認できます</span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">該当する依頼はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">案件管理番号</th>
                <th className="px-3 py-2 text-left font-bold">案件名</th>
                <th className="px-3 py-2 text-right font-bold">請求金額</th>
                <th className="px-3 py-2 text-left font-bold">確認者</th>
                <th className="px-3 py-2 text-left font-bold">依頼日</th>
                <th className="px-3 py-2 text-left font-bold">ステータス</th>
                <th className="px-3 py-2 text-left font-bold">確認結果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => (
                <tr key={row.requestId} className="hover:bg-gray-50/60 align-top">
                  <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{row.case_number}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/cases/${row.case_id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[180px]">
                      {row.deal_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-mono font-semibold text-gray-800">¥{row.amount.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-[12px] text-gray-700">{row.confirmerName || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.requestedDate}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_BADGE[row.status]}`}>{row.status}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-[12px] text-gray-700 max-w-[260px] whitespace-pre-wrap">
                      {row.resultNote || <span className="text-gray-300">—</span>}
                      {row.autoClosed && <span className="ml-1 text-[10px] text-gray-400">(入金確定で自動)</span>}
                      {row.confirmedDate && <div className="text-[11px] text-gray-400 mt-0.5">確認日 {row.confirmedDate}</div>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-brand-600 text-white font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1 text-[10px] font-mono ${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
      )}
    </button>
  )
}
