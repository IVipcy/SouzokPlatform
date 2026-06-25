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
}

type Candidate = { id: string; name: string }

type Props = {
  rows: ManagerProgressRow[]
  candidates: Candidate[]
  currentMemberId: string | null
}

const FILTERS = ['未対応', '依頼中', '確認済'] as const
const STATUS_BADGE: Record<string, string> = {
  '未対応': 'bg-gray-100 text-gray-600 border-gray-200',
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

export default function ProgressReportManagerTab({ rows, candidates, currentMemberId }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | '未対応' | '依頼中' | '確認済'>('未対応')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const counts = {
    未対応: rows.filter(r => r.status === '未対応').length,
    依頼中: rows.filter(r => r.status === '依頼中').length,
    確認済: rows.filter(r => r.status === '確認済').length,
  }
  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter)

  const handleRequest = async (row: ManagerProgressRow) => {
    const confirmerId = selected[row.case_id] ?? row.sales_member_id ?? ''
    if (!confirmerId) { showToast('確認者を選択してください', 'error'); return }
    if (!currentMemberId) return
    setBusy(row.case_id)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('progress_reports').insert({
        case_id: row.case_id,
        requester_id: currentMemberId,
        confirmer_id: confirmerId,
        status: '依頼中',
        requested_date: today,
      })
      if (error) throw error
      await supabase.from('notifications').insert({
        member_id: confirmerId,
        type: 'progress_review_requested',
        case_id: row.case_id,
        title: '進捗確認の依頼',
        body: `${row.case_number} ${row.deal_name} の進捗確認を依頼されました`,
      })
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
        <span className="ml-auto text-[11px] text-gray-400">確認者を選んで「依頼する」で進捗確認を依頼</span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">該当する案件はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">案件管理番号</th>
                <th className="px-3 py-2 text-left font-bold">案件名</th>
                <th className="px-3 py-2 text-left font-bold">受注担当者名</th>
                <th className="px-3 py-2 text-left font-bold">確認者</th>
                <th className="px-3 py-2 text-left font-bold">確認依頼</th>
                <th className="px-3 py-2 text-left font-bold">進捗確認依頼日</th>
                <th className="px-3 py-2 text-left font-bold">確認ステータス</th>
                <th className="px-3 py-2 text-left font-bold">確認日付</th>
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
                    <td className="px-3 py-2.5">
                      {isUnrequested ? (
                        <select
                          value={selected[row.case_id] ?? row.sales_member_id ?? ''}
                          onChange={e => setSelected(prev => ({ ...prev, [row.case_id]: e.target.value }))}
                          className="text-[12px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-brand-400 max-w-[140px]"
                        >
                          <option value="">選択してください</option>
                          {candidates.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[12px] text-gray-700">{row.confirmerName || <span className="text-gray-300">—</span>}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isUnrequested ? (
                        <button
                          type="button"
                          onClick={() => handleRequest(row)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 border border-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors"
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" strokeWidth={2.25} />}
                          依頼する
                        </button>
                      ) : (
                        <span className="text-[12px] text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.requestedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_BADGE[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.confirmedDate ?? <span className="text-gray-300">—</span>}</td>
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
