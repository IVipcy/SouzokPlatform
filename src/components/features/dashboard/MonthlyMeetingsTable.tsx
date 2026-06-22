'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Calendar, AlertTriangle, ArrowUpDown } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { CASE_STATUSES } from '@/lib/constants'

type CaseMeeting = {
  id: string
  case_number: string
  deal_name: string
  status: string
  meeting_date: string | null
  meeting_executed_date: string | null
  client_response_due_date: string | null
  meeting_place: string | null
  consideration_decline_reason: string | null
}

type Props = {
  /** 集計対象の案件（既に当月面談ありで絞られている、または絞り込み前を渡しても OK） */
  cases: CaseMeeting[]
  /** タイトル */
  title?: string
  /** 当月で絞り込む（'YYYY-MM'）。未指定なら絞り込まない */
  filterByYearMonth?: string
  /** ステータスフィルタを表示する */
  showStatusFilter?: boolean
}

// ステータスフィルタ候補（マイページ仕様）
const STATUS_FILTERS = ['面談設定済', '検討中', '受注', '失注', '保留・長期'] as const

type SortKey = 'response_due' | 'meeting_date' | 'meeting_executed' | 'status' | 'case_number' | 'deal_name'
type SortOrder = 'asc' | 'desc'

// CASE_STATUSES の並び順を index で表現してソートに使う
const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  CASE_STATUSES.map((s, i) => [s.key, i]),
)

/**
 * 当月面談一覧テーブル。
 * - 当月に「面談予定 or 面談実施」された案件を表示
 * - 並べ替え: お客様回答予定日(デフォルト) / 面談予定日 / 面談実施日 / ステータス / 番号 / 案件名
 * - 案件名クリックで案件詳細へ
 */
export default function MonthlyMeetingsTable({ cases, title = '当月面談一覧', filterByYearMonth, showStatusFilter = false }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('response_due')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    let arr = cases
    if (filterByYearMonth) {
      arr = arr.filter(c => {
        const a = c.meeting_date?.startsWith(filterByYearMonth)
        const b = c.meeting_executed_date?.startsWith(filterByYearMonth)
        return a || b
      })
    }
    if (statusFilter !== 'all') {
      arr = arr.filter(c => c.status === statusFilter)
    }
    return arr
  }, [cases, filterByYearMonth, statusFilter])

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
        case 'meeting_date':
          av = a.meeting_date ?? '9999-12-31'
          bv = b.meeting_date ?? '9999-12-31'
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
        <Calendar className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {sorted.length}件
        </span>
        {showStatusFilter && (
          <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
            <FilterChip label="すべて" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            {STATUS_FILTERS.map(s => (
              <FilterChip
                key={s}
                label={s}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                count={cases.filter(c => c.status === s).length}
              />
            ))}
          </div>
        )}
        <span className="ml-auto text-[11px] text-gray-400">
          お客様回答予定日が迫っているものが上
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">
          {filterByYearMonth ? `${filterByYearMonth} に面談予定/実施の案件はありません` : '面談予定/実施の案件はありません'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <SortableTh label="管理番号"      sortKey="case_number"      currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="案件名"        sortKey="deal_name"        currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="ステータス"     sortKey="status"           currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="面談予定日"     sortKey="meeting_date"     currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="面談実施日"     sortKey="meeting_executed" currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="お客様回答予定日" sortKey="response_due"    currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <th className="px-3 py-2 text-left font-bold">面談場所</th>
                <th className="px-3 py-2 text-left font-bold">検討中・不受託理由</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(c => {
                const statusDef = CASE_STATUSES.find(s => s.key === c.status)
                const dueOverdue = !!(c.client_response_due_date && c.client_response_due_date < today && c.status === '検討中')
                return (
                  <tr key={c.id} className={`hover:bg-gray-50/60 ${dueOverdue ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{c.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[260px]">
                        {c.deal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {statusDef ? <Badge label={statusDef.label} color={statusDef.color} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{c.meeting_date ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{c.meeting_executed_date ?? '—'}</td>
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
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.meeting_place ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.consideration_decline_reason ?? '—'}</td>
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
