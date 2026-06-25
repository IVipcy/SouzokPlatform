'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send, Loader2, ClipboardCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

export type ManagerProgressRow = {
  case_id: string
  case_number: string
  deal_name: string
  sales_name: string | null
  sales_member_id: string | null
  reportId: string | null
  status: '未対応' | '依頼中' | '確認済'
  confirmerId: string | null
  confirmerName: string | null
  requestedDate: string | null
  confirmedDate: string | null
  reviewPoint: string | null
  confirmComment: string | null
}

type Candidate = { id: string; name: string }

type Props = {
  rows: ManagerProgressRow[]
  candidates: Candidate[]
  currentMemberId: string | null
}

const FILTERS = ['未対応', '依頼中', '確認済'] as const
const STATUS_BADGE: Record<string, string> = {
  '未対応': 'bg-slate-100 text-slate-600',
  '依頼中': 'bg-amber-50 text-amber-700',
  '確認済': 'bg-emerald-50 text-emerald-700',
}

export default function ProgressReportManagerTab({ rows, currentMemberId }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | '未対応' | '依頼中' | '確認済'>('未対応')
  const [reviewPoints, setReviewPoints] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const counts = {
    未対応: rows.filter(r => r.status === '未対応').length,
    依頼中: rows.filter(r => r.status === '依頼中').length,
    確認済: rows.filter(r => r.status === '確認済').length,
  }
  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter)

  // 確認ポイントを添えて進捗確認を開始（確認者は事前指定しない）。確認は各案件の進捗報告で本人以外が行う。
  const handleRequest = async (row: ManagerProgressRow) => {
    if (!currentMemberId) return
    setBusy(row.case_id)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('progress_reports').insert({
        case_id: row.case_id,
        requester_id: currentMemberId,
        confirmer_id: null,
        status: '依頼中',
        requested_date: today,
        review_point: (reviewPoints[row.case_id] ?? '').trim() || null,
      })
      if (error) throw error
      showToast('進捗確認を依頼しました', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('依頼に失敗しました', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <ClipboardCheck className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">進捗報告</h3>
        <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <FilterChip label="すべて" active={filter === 'all'} onClick={() => setFilter('all')} />
          {FILTERS.map(f => (
            <FilterChip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} count={counts[f]} />
          ))}
        </div>
        <span className="ml-auto text-[11px] text-gray-400">確認ポイントを書いて「依頼する」→ 各案件の進捗報告で本人以外が確認</span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">該当する案件はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 1000 }}>
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">案件管理番号</th>
                <th className="px-3 py-2 text-left font-medium">案件名</th>
                <th className="px-3 py-2 text-left font-medium">受注担当者名</th>
                <th className="px-3 py-2 text-left font-medium">進捗確認依頼日</th>
                <th className="px-3 py-2 text-left font-medium">確認ポイント</th>
                <th className="px-3 py-2 text-left font-medium">確認コメント</th>
                <th className="px-3 py-2 text-left font-medium">確認者</th>
                <th className="px-3 py-2 text-left font-medium">確認ステータス</th>
                <th className="px-3 py-2 text-left font-medium">確認日付</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => {
                const isUnrequested = row.status === '未対応'
                const isBusy = busy === row.case_id
                return (
                  <tr key={row.case_id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{row.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${row.case_id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[200px]">
                        {row.deal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{row.sales_name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.requestedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {isUnrequested ? (
                        <input
                          type="text"
                          value={reviewPoints[row.case_id] ?? ''}
                          onChange={e => setReviewPoints(prev => ({ ...prev, [row.case_id]: e.target.value }))}
                          placeholder="確認ポイント（任意）"
                          className="text-[12px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-brand-400 w-44"
                        />
                      ) : (
                        <span className="text-[12px] text-gray-700 whitespace-pre-wrap max-w-[200px] inline-block">{row.reviewPoint || <span className="text-gray-300">—</span>}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-pre-wrap max-w-[200px]">{row.confirmComment || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{row.confirmerName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${STATUS_BADGE[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.confirmedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {isUnrequested && (
                        <button
                          type="button"
                          onClick={() => handleRequest(row)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" strokeWidth={2.25} />}
                          依頼する
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
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
