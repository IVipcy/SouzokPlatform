'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

export type PayCheckReviewRow = {
  requestId: string
  invoice_id: string
  case_id: string
  case_number: string
  deal_name: string
  amount: number
  due_date: string | null
  requesterId: string | null
  requesterName: string | null
  requestedDate: string
  status: '依頼中' | '確認済'
  resultNote: string | null
  confirmedDate: string | null
  autoClosed: boolean
}

type Props = {
  rows: PayCheckReviewRow[]
  currentMemberId: string | null
}

const STATUS_BADGE: Record<string, string> = {
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

export default function PaymentCheckReviewTab({ rows, currentMemberId }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<'要確認' | '確認済'>('要確認')
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const counts = {
    要確認: rows.filter(r => r.status === '依頼中').length,
    確認済: rows.filter(r => r.status === '確認済').length,
  }
  const filtered = rows.filter(r => (filter === '要確認' ? r.status === '依頼中' : r.status === '確認済'))

  // 確認結果を入れて「確認済」に。依頼者（経理/管理担当）へ結果つきで通知を返す。
  const handleConfirm = async (row: PayCheckReviewRow) => {
    if (!currentMemberId) return
    const note = (notes[row.requestId] ?? '').trim()
    if (!note) { showToast('確認結果を入力してください', 'error'); return }
    setBusy(row.requestId)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase
        .from('payment_check_requests')
        .update({ status: '確認済', confirmed_date: today, result_note: note })
        .eq('id', row.requestId)
        .eq('confirmer_id', currentMemberId)
      if (error) throw error
      if (row.requesterId) {
        await supabase.from('notifications').insert({
          member_id: row.requesterId,
          type: 'payment_check_confirmed',
          case_id: row.case_id,
          title: '入金状況の確認結果',
          body: `${row.case_number} ${row.deal_name}（¥${row.amount.toLocaleString()}）の入金確認結果: ${note}`,
        })
      }
      showToast('確認結果を報告しました', 'success')
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
        <Banknote className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">入金状況確認</h3>
        <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <FilterChip label="要確認" active={filter === '要確認'} onClick={() => setFilter('要確認')} count={counts.要確認} />
          <FilterChip label="確認済" active={filter === '確認済'} onClick={() => setFilter('確認済')} count={counts.確認済} />
        </div>
        <span className="ml-auto text-[11px] text-gray-400">入金を確認したら結果を入力して「確認済にする」</span>
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
                <th className="px-3 py-2 text-right font-bold">請求金額</th>
                <th className="px-3 py-2 text-left font-bold">入金期日</th>
                <th className="px-3 py-2 text-left font-bold">依頼者</th>
                <th className="px-3 py-2 text-left font-bold">確認結果</th>
                <th className="px-3 py-2 text-left font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => {
                const isBusy = busy === row.requestId
                const isPending = row.status === '依頼中'
                return (
                  <tr key={row.requestId} className="hover:bg-gray-50/60 align-top">
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{row.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${row.case_id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[180px]">
                        {row.deal_name}
                      </Link>
                      <div className="text-[11px] text-gray-400">依頼日 {row.requestedDate}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-mono font-semibold text-gray-800">¥{row.amount.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.due_date ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{row.requesterName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {isPending ? (
                        <textarea
                          value={notes[row.requestId] ?? ''}
                          onChange={e => setNotes(prev => ({ ...prev, [row.requestId]: e.target.value }))}
                          placeholder="例: 12/15に○○銀行から振込済と確認。再度CSV突合をお願いします"
                          rows={2}
                          className="w-full min-w-[220px] text-[12px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-brand-400 resize-y"
                        />
                      ) : (
                        <div className="text-[12px] text-gray-700 max-w-[260px] whitespace-pre-wrap">
                          {row.resultNote || <span className="text-gray-300">—</span>}
                          {row.autoClosed && <span className="ml-1 text-[10px] text-gray-400">(自動)</span>}
                          {row.confirmedDate && <div className="text-[11px] text-gray-400 mt-0.5">確認日 {row.confirmedDate}</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isPending ? (
                        <button
                          type="button"
                          onClick={() => handleConfirm(row)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />}
                          確認済にする
                        </button>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_BADGE[row.status]}`}>{row.status}</span>
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
