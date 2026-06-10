'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquare, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { cascadeDeleteCase } from '@/lib/caseDelete'
import { CASE_STATUSES, getCaseStatusLabel } from '@/lib/constants'

export type ConsultCase = {
  id: string
  case_number: string
  deal_name: string
  status: string
  created_at?: string | null
  meeting_executed_date: string | null
  client_response_due_date: string | null
  /** 送客元 = 案件詳細の「詳細受注ルート」 */
  order_route_detail: string | null
  /** チーム = 受注担当メンバーの所属チーム名（manageMode で表示） */
  team_name?: string | null
  /** 受注担当者名（manageMode で表示） */
  sales_name?: string | null
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
  /** 案件管理ページ用。チーム・受注担当列の表示＋チェックボックス選択・一括削除を有効化 */
  manageMode?: boolean
}

// 相談案件のステータス絞り込み候補（受注担当が受託に至るまでのステータス）
// ※ 長期保留・紹介のみは「個別管理案件」へ分類変更したため除外
const CONSULT_STATUS_FILTERS = ['検討中', '検討中（契約書待ち）', '受注', '失注'] as const

type SortKey = 'created' | 'response_due' | 'meeting_executed' | 'status' | 'case_number' | 'deal_name'
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
export default function ConsultationCasesTable({ cases, manageMode = false }: Props) {
  const router = useRouter()
  // 案件管理（manageMode）は案件作成日の降順を既定に。マイページは従来どおり回答予定日順。
  const [sortKey, setSortKey] = useState<SortKey>(manageMode ? 'created' : 'response_due')
  const [sortOrder, setSortOrder] = useState<SortOrder>(manageMode ? 'desc' : 'asc')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

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
        case 'created':
          av = a.created_at ?? ''
          bv = b.created_at ?? ''
          break
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

  // ─── 選択（manageMode のみ） ───
  const visibleIds = sorted.map(c => c.id)
  const selectedVisible = visibleIds.filter(id => selected.has(id))
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someSelected = selectedVisible.length > 0 && !allSelected

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  // DeleteConfirmModal が削除中状態・エラー表示・クローズを管理する。
  // ここでは削除を実行し、成功時のみトースト＋選択解除＋リフレッシュ。失敗は throw して modal に委ねる。
  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    const supabase = createClient()
    const count = selected.size
    for (const id of selected) {
      await cascadeDeleteCase(supabase, id)
    }
    showToast(`${count}件の案件を削除しました`, 'success')
    setSelected(new Set())
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <MessageSquare className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">相談案件一覧</h3>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {sorted.length}件
        </span>
        {/* 案件管理ページではページ上部のステータス絞り込みを使うため、ここでは非表示 */}
        {!manageMode && (
          <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
            <FilterChip label="すべて" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            {CONSULT_STATUS_FILTERS.map(s => (
              <FilterChip
                key={s}
                label={getCaseStatusLabel(s)}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                count={cases.filter(c => c.status === s).length}
              />
            ))}
          </div>
        )}
        {manageMode && selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] font-semibold text-gray-600">{selected.size}件選択中</span>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
              選択を削除
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[12px] text-gray-400 hover:text-gray-600 px-1"
            >
              解除
            </button>
          </div>
        ) : (
          <span className="ml-auto text-[11px] text-gray-400">
            お客様回答予定日が迫っているものが上
          </span>
        )}
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
                {manageMode && (
                  <th className="px-3 py-2 text-center font-bold w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-brand-600 cursor-pointer align-middle"
                      title="表示中をすべて選択"
                    />
                  </th>
                )}
                <SortableTh label="案件管理番号"    sortKey="case_number"      currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="案件名"          sortKey="deal_name"        currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <th className="px-3 py-2 text-left font-bold">送客元</th>
                <SortableTh label="面談実施日"      sortKey="meeting_executed" currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="面談結果"        sortKey="status"           currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <SortableTh label="お客様回答予定日" sortKey="response_due"     currentKey={sortKey} order={sortOrder} onClick={handleSort} />
                <th className="px-3 py-2 text-left font-bold">残り日数</th>
                {manageMode && <th className="px-3 py-2 text-left font-bold">チーム</th>}
                {manageMode && <th className="px-3 py-2 text-left font-bold">受注担当</th>}
                <th className="px-3 py-2 text-left font-bold">管理担当</th>
                <th className="px-3 py-2 text-left font-bold">受注内容</th>
                <th className="px-3 py-2 text-right font-bold">受注金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(c => {
                const statusDef = CASE_STATUSES.find(s => s.key === c.status)
                // お客様の回答待ち（検討中／検討中（契約書待ち）／面談設定済）のときだけ残り日数・超過を出す。
                // 受託・不受託・紹介のみ等の決着済みステータスでは回答待ちではないのでカウントしない。
                const awaitingAnswer = c.status === '検討中' || c.status === '検討中（契約書待ち）' || c.status === '面談設定済'
                const dueOverdue = !!(c.client_response_due_date && c.client_response_due_date < today && awaitingAnswer)
                // 残り日数（お客様回答予定日 − 本日）。マイナス＝超過。回答待ちのときのみ。
                const daysRemaining = (awaitingAnswer && c.client_response_due_date)
                  ? Math.round((new Date(c.client_response_due_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
                  : null
                const procedures = (c.procedure_type ?? []).filter(Boolean)
                const isSelected = selected.has(c.id)
                return (
                  <tr key={c.id} className={`hover:bg-gray-50/60 ${isSelected ? 'bg-brand-50/50' : dueOverdue ? 'bg-red-50/40' : ''}`}>
                    {manageMode && (
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(c.id)}
                          className="w-4 h-4 accent-brand-600 cursor-pointer align-middle"
                        />
                      </td>
                    )}
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
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {daysRemaining === null ? (
                        <span className="text-gray-300">—</span>
                      ) : daysRemaining < 0 ? (
                        <span className="text-red-600 font-bold">{Math.abs(daysRemaining)}日超過</span>
                      ) : daysRemaining === 0 ? (
                        <span className="text-amber-600 font-bold">本日</span>
                      ) : (
                        <span className={daysRemaining <= 3 ? 'text-amber-600 font-semibold' : 'text-gray-700'}>あと{daysRemaining}日</span>
                      )}
                    </td>
                    {manageMode && (
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">{c.team_name || <span className="text-gray-300">—</span>}</td>
                    )}
                    {manageMode && (
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">{c.sales_name || <span className="text-gray-300">—</span>}</td>
                    )}
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

      <DeleteConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="案件の一括削除"
        message={`選択した ${selected.size} 件の案件を削除します。関連するタスク・担当者・書類・請求書・入金も全て削除され、取り消せません。本当に削除しますか？`}
        onConfirm={handleDeleteSelected}
      />
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
        title={isActive ? (order === 'asc' ? '昇順（小さい順）で並び替え中。クリックで降順' : '降順（大きい順）で並び替え中。クリックで昇順') : 'クリックで並び替え'}
        className={`inline-flex items-center gap-1 hover:text-brand-600 transition-colors ${isActive ? 'text-brand-700' : ''}`}
      >
        {label}
        {isActive ? (
          order === 'asc'
            ? <ArrowUp className="w-3.5 h-3.5 text-brand-600" strokeWidth={2.5} />
            : <ArrowDown className="w-3.5 h-3.5 text-brand-600" strokeWidth={2.5} />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </button>
    </th>
  )
}
