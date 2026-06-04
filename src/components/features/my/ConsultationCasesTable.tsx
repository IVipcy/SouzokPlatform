'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { MessageSquare, AlertTriangle, ArrowUpDown } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { CASE_STATUSES } from '@/lib/constants'

export type ConsultCase = {
  id: string
  case_number: string
  deal_name: string
  status: string
  meeting_executed_date: string | null
  client_response_due_date: string | null
  /** 送客元 = 案件詳細の「詳細受注ルート」 */
  order_route_detail: string | null
  /** 管理担当者名 */
  manager_name: string | null
  /** 受注内容 = 手続き区分（複数可） */
  procedure_type: string[] | null
  /** 受注金額 = 報酬金額（行政 or 司法の入っている方） */
  order_amount: number | null
  /** 新規受注だが管理担当が未アサイン → 青NEW */
  newOrderUnassigned?: boolean
  /** 受注から3日超過で管理担当未アサイン → アサイン未完了アラート */
  assignOverdue?: boolean
  /** 担当者変更が発生し管理担当が未設定 → 赤NEW */
  assigneeChanged?: boolean
  /** 面談予定日超過なのに面談メモ未記載（info=翌日〜 / yellow=4日〜 / red=7日〜） */
  meetingMemoMissing?: 'info' | 'yellow' | 'red' | null
}

type Props = {
  cases: ConsultCase[]
}

// 相談案件のステータス（受注担当が責任をもって管理するステータス）
const CONSULT_STATUS_FILTERS = ['面談設定済', '検討中', '受注', '失注', '保留・長期'] as const

type SortKey = 'response_due' | 'meeting_executed' | 'status' | 'case_number' | 'deal_name'
type SortOrder = 'asc' | 'desc'

const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  CASE_STATUSES.map((s, i) => [s.key, i]),
)

const formatMan = (yen: number): string => {
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(1)}億`
  return `${Math.round(yen / 10_000).toLocaleString()}`
}

/**
 * 相談案件一覧（受注担当マイページ「当月面談」タブ）
 * - お客様回答予定日が迫っている案件を上から順に表示（デフォルト）
 * - ステータスでフィルタ可能
 */
export default function ConsultationCasesTable({ cases }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('response_due')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return cases
    return cases.filter(c => c.status === statusFilter)
  }, [cases, statusFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const dir = sortOrder === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      let av: string | number = '', bv: string | number = ''
      switch (sortKey) {
        case 'response_due':
          av = a.client_response_due_date ?? '9999-12-31'
          bv = b.client_response_due_date ?? '9999-12-31'
          break
        case 'meeting_executed':
          av = a.meeting_executed_date ?? '9999-12-31'
          bv = b.meeting_executed_date ?? '9999-12-31'
          break
        case 'status':
          av = STATUS_ORDER[a.status] ?? 99
          bv = STATUS_ORDER[b.status] ?? 99
          break
        case 'case_number':
          av = a.case_number
          bv = b.case_number
          break
        case 'deal_name':
          av = a.deal_name
          bv = b.deal_name
          break
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return arr
  }, [filtered, sortKey, sortOrder])

  const today = new Date().toISOString().split('T')[0]

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <MessageSquare className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">相談案件一覧</h3>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {sorted.length}件
        </span>
        <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <FilterChip label="すべて" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          {CONSULT_STATUS_FILTERS.map(s => (
            <FilterChip
              key={s}
              label={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              count={cases.filter(c => c.status === s).length}
            />
          ))}
        </div>
        <span className="ml-auto text-[11px] text-gray-400">
          お客様回答予定日が迫っているものが上
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">
          相談案件はありません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <SortableTh label="案件管理番号"    sortKey="case_number"      currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="案件名"          sortKey="deal_name"        currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <th className="px-3 py-2 text-left font-bold">送客元</th>
                <SortableTh label="面談実施日"      sortKey="meeting_executed" currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="面談結果"        sortKey="status"           currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="お客様回答予定日" sortKey="response_due"     currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <th className="px-3 py-2 text-left font-bold">管理担当</th>
                <th className="px-3 py-2 text-left font-bold">受注内容</th>
                <th className="px-3 py-2 text-right font-bold">受注金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(c => {
                const statusDef = CASE_STATUSES.find(s => s.key === c.status)
                const dueOverdue = !!(c.client_response_due_date && c.client_response_due_date < today && (c.status === '検討中' || c.status === '面談設定済'))
                const procedures = (c.procedure_type ?? []).filter(Boolean)
                return (
                  <tr key={c.id} className={`hover:bg-gray-50/60 ${dueOverdue ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{c.case_number}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {c.newOrderUnassigned && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-600 text-white flex-shrink-0" title="新規受注・管理担当未アサイン">NEW</span>
                        )}
                        {c.assigneeChanged && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white flex-shrink-0" title="担当者変更・管理担当未設定">NEW</span>
                        )}
                        <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate max-w-[200px]">
                          {c.deal_name}
                        </Link>
                      </div>
                      {c.assignOverdue && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                          <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />
                          【重要】アサインが完了していません
                        </div>
                      )}
                      {c.meetingMemoMissing && (
                        <div className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold ${c.meetingMemoMissing === 'red' ? 'text-red-600' : c.meetingMemoMissing === 'yellow' ? 'text-amber-600' : 'text-gray-500'}`}>
                          <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />
                          【重要】面談予定日超過・面談メモ未記載
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.order_route_detail || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{c.meeting_executed_date ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {statusDef ? <Badge label={statusDef.label} color={statusDef.color} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {c.client_response_due_date ? (
                        <span className={dueOverdue ? 'text-red-600 font-bold inline-flex items-center gap-1' : 'text-gray-700'}>
                          {dueOverdue && <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />}
                          {c.client_response_due_date}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{c.manager_name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {procedures.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {procedures.map(p => (
                            <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-right text-gray-700">
                      {c.order_amount && c.order_amount > 0 ? (
                        <span>{formatMan(c.order_amount)}<span className="text-gray-400 ml-0.5">万円</span></span>
                      ) : (
                        <span className="text-gray-300">—</span>
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

function SortableTh({
  label, sortKey, currentKey, order, onClick,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  order: SortOrder
  onClick: (key: SortKey) => void
}) {
  const isActive = currentKey === sortKey
  return (
    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-brand-600 transition-colors ${isActive ? 'text-brand-700' : ''}`}
      >
        {label}
        <ArrowUpDown className={`w-3 h-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
        {isActive && <span className="text-[10px]">{order === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}
