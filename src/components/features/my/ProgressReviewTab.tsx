'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

export type ReviewProgressRow = {
  reportId: string
  case_id: string
  case_number: string
  deal_name: string
  requesterId: string | null
  requesterName: string | null
  requestedDate: string
  status: '依頼中' | '確認済'
  confirmedDate: string | null
}

type Props = {
  rows: ReviewProgressRow[]
  currentMemberId: string | null
}

const STATUS_BADGE: Record<string, string> = {
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

export default function ProgressReviewTab({ rows, currentMemberId }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<'要確認' | '確認済'>('要確認')
  const [busy, setBusy] = useState<string | null>(null)

  const counts = {
    要確認: rows.filter(r => r.status === '依頼中').length,
    確認済: rows.filter(r => r.status === '確認済').length,
  }
  const filtered = rows.filter(r => (filter === '要確認' ? r.status === '依頼中' : r.status === '確認済'))

  // 確認済にできるのは確認者本人のみ。このリストは confirmer_id = 自分 のものだけが渡される前提。
  const handleConfirm = async (row: ReviewProgressRow) => {
    if (!currentMemberId) return
    setBusy(row.reportId)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase
        .from('progress_reports')
        .update({ status: '確認済', confirmed_date: today })
        .eq('id', row.reportId)
        .eq('confirmer_id', currentMemberId) // 念のため本人チェック
      if (error) throw error
      if (row.requesterId) {
        await supabase.from('notifications').insert({
          member_id: row.requesterId,
          type: 'progress_review_confirmed',
          case_id: row.case_id,
          title: '進捗確認が完了しました',
          body: `${row.case_number} ${row.deal_name} の進捗確認が確認済になりました`,
        })
      }
      showToast('確認済にしました', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('更新に失敗しました', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <ClipboardList className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">進捗確認依頼</h3>
        <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <FilterChip label="要確認" active={filter === '要確認'} onClick={() => setFilter('要確認')} count={counts.要確認} />
          <FilterChip label="確認済" active={filter === '確認済'} onClick={() => setFilter('確認済')} count={counts.確認済} />
        </div>
        <span className="ml-auto text-[11px] text-gray-400">確認したら「確認済にする」を押してください</span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">
          {filter === '要確認' ? '確認待ちの依頼はありません' : '確認済の依頼はありません'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">案件管理番号</th>
                <th className="px-3 py-2 text-left font-bold">案件名</th>
                <th className="px-3 py-2 text-left font-bold">依頼者名</th>
                <th className="px-3 py-2 text-left font-bold">進捗確認依頼日</th>
                <th className="px-3 py-2 text-left font-bold">確認ステータス</th>
                <th className="px-3 py-2 text-left font-bold">確認日付</th>
                <th className="px-3 py-2 text-left font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => {
                const isBusy = busy === row.reportId
                return (
                  <tr key={row.reportId} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{row.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${row.case_id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[200px]">
                        {row.deal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{row.requesterName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.requestedDate}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_BADGE[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.confirmedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {row.status === '依頼中' && (
                        <button
                          type="button"
                          onClick={() => handleConfirm(row)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />}
                          確認済にする
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
