'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Briefcase, AlertTriangle, Trash2 } from 'lucide-react'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { cascadeDeleteCase } from '@/lib/caseDelete'

type CaseFlag = 'purple' | 'red' | 'yellow' | 'blue' | null

export type MyCaseRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  deceased_name: string | null
  expected_completion_date: string | null
  completion_date: string | null
  has_complaint?: boolean | null
  last_opened_at?: string | null
  created_at?: string | null
  client_name?: string | null
  sales_name?: string | null
  manager_name?: string | null
  /** 担当チーム名（受注担当の所属チーム。検索用） */
  team_name?: string | null
  /** 受注内容（手続区分） */
  procedure_type?: string[] | null
  /** オーダーシート完成日時（作成済判定） */
  order_sheet_completed_at?: string | null
  /** 進捗: 次の未完了タスク + 完了/総数 */
  nextTaskId?: string | null
  nextTaskTitle?: string | null
  progressDone?: number
  progressTotal?: number
  /** 週次報告状況 */
  weeklyStatus?: '未対応' | '依頼中' | '確認済'
  /** 直近お客様報告 */
  lastCommDate?: string | null
  lastCommDetail?: string | null
  /** 管理担当向けアラート: 週次報告の漏れ */
  weeklyReportMissing?: boolean
  /** 管理担当向けアラート: タスク期限超過 */
  taskOverdue?: boolean
  /** 進捗管理ダッシュボード経由で計算済の場合 */
  flag?: CaseFlag
}

const WEEKLY_BADGE: Record<string, string> = {
  '未対応': 'bg-gray-100 text-gray-600 border-gray-200',
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

type Props = {
  memberId: string
  cases: MyCaseRow[]
  /** ヘッダーや「↗ 全件見る」など最小表示にする */
  compact?: boolean
  /** 案件管理ページ用。チェックボックス選択・一括削除を有効化 */
  selectable?: boolean
  /** 完了案件ビュー: 鮮度フラグの代わりに「完了」バッジを出し、フラグなし行も表示する */
  showCompleted?: boolean
}

const FLAG_LABEL: Record<NonNullable<CaseFlag>, string> = {
  purple: '紫',
  red:    '赤',
  yellow: '黄',
  blue:   '青',
}
const FLAG_BG: Record<NonNullable<CaseFlag>, string> = {
  purple: 'bg-purple-600 text-white',
  red:    'bg-red-500 text-white',
  yellow: 'bg-yellow-400 text-gray-900',
  blue:   'bg-blue-600 text-white',
}

const FLAG_RANK: Record<NonNullable<CaseFlag>, number> = {
  purple: 0, red: 1, yellow: 2, blue: 3,
}

// 鮮度フラグの付与対象 = 対応中の案件のみ（完了・相談案件・個別管理案件にはフラグを出さない）。
// ※ 一覧の行の絞り込みは呼び出し側で実施。ここはフラグ判定スコープのみ。
const MANAGEMENT_ACTIVE = new Set(['対応中'])

// 鮮度フラグ: 紫=クレーム / 赤・黄・青=最終接触(案件を最後に開いた日)からの経過日数
// 青: <=3日 / 黄: 4〜7日 / 赤: >7日
const FRESHNESS = { yellowDays: 3, redDays: 7 }

function computeFlagSimple(c: MyCaseRow): CaseFlag {
  if (!MANAGEMENT_ACTIVE.has(c.status)) return null
  if (c.has_complaint) return 'purple'
  const ref = c.last_opened_at ?? c.created_at ?? null
  if (!ref) return 'blue'
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
  if (Number.isNaN(days)) return 'blue'
  if (days > FRESHNESS.redDays) return 'red'
  if (days > FRESHNESS.yellowDays) return 'yellow'
  return 'blue'
}

/**
 * マイページの担当案件タブ
 * 進捗管理ダッシュボードと同じテーブル形式:
 *   フラグ / 案件管理番号 / 案件名 / 担当者(受注/管理 別列) / 完了予定日 / 依頼者名
 */
export default function MyPageCasesTab({ memberId: _memberId, cases, compact = false, selectable = false, showCompleted = false }: Props) {
  void _memberId
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const rows = cases.map(c => ({
    ...c,
    flag: c.flag ?? computeFlagSimple(c),
  }))

  // 通常ビュー: 完了・失注（フラグなし）は除外。完了ビュー: 全件表示。
  const visibleRows = showCompleted ? [...rows] : rows.filter(r => r.flag !== null)
  // ソート: 完了ビューは案件番号順、通常はフラグ優先度 → 完了予定日昇順
  visibleRows.sort((a, b) => {
    if (showCompleted) return a.case_number.localeCompare(b.case_number)
    const fa = FLAG_RANK[a.flag!]
    const fb = FLAG_RANK[b.flag!]
    if (fa !== fb) return fa - fb
    const ad = a.expected_completion_date ?? '9999-12-31'
    const bd = b.expected_completion_date ?? '9999-12-31'
    return ad.localeCompare(bd)
  })

  const visibleIds = visibleRows.map(r => r.id)
  const selectedVisible = visibleIds.filter(id => selected.has(id))
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someSelected = selectedVisible.length > 0 && !allSelected
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allSelected) visibleIds.forEach(id => next.delete(id)); else visibleIds.forEach(id => next.add(id))
    return next
  })
  // 削除は DeleteConfirmModal が削除中状態・エラー表示・クローズを管理。成功時のみトースト＋解除＋更新。
  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    const supabase = createClient()
    const count = selected.size
    for (const id of selected) await cascadeDeleteCase(supabase, id)
    showToast(`${count}件の案件を削除しました`, 'success')
    setSelected(new Set())
    router.refresh()
  }

  if (visibleRows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-[13px] text-gray-400">
        {showCompleted ? '完了案件はありません' : '対応中の案件はありません'}
      </div>
    )
  }

  return (
    <div>
      {selectable && selected.size > 0 && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg">
          <span className="text-[12px] font-semibold text-gray-700">{selected.size}件選択中</span>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
            選択を削除
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] text-gray-400 hover:text-gray-600 px-1">解除</button>
        </div>
      )}
      <div className={`bg-white rounded-xl overflow-x-auto ${compact ? '' : 'border border-gray-200 shadow-sm'}`}>
      <table className="w-full text-[13px] table-auto">
        <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 uppercase tracking-wider">
          <tr>
            {selectable && (
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
            <th className="px-3 py-2 text-center font-bold whitespace-nowrap">フラグ</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件管理番号</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件名</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注担当</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">管理担当</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">オーダーシート</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注内容</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">完了予定日</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">進捗</th>
            <th className="px-3 py-2 text-center font-bold whitespace-nowrap">週次報告状況</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">直近お客様報告日</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">やり取り詳細</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibleRows.map(c => {
            const total = c.progressTotal ?? 0
            const done = c.progressDone ?? 0
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const weekly = c.weeklyStatus ?? '未対応'
            const isSelected = selected.has(c.id)
            return (
            <tr key={c.id} className={`hover:bg-gray-50/60 ${isSelected ? 'bg-brand-50/50' : ''}`}>
              {selectable && (
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(c.id)}
                    className="w-4 h-4 accent-brand-600 cursor-pointer align-middle"
                  />
                </td>
              )}
              <td className="px-3 py-2.5 text-center">
                {c.flag ? (
                  <span className={`inline-flex items-center justify-center w-11 py-0.5 rounded text-[12px] font-bold ${FLAG_BG[c.flag]}`}>
                    {FLAG_LABEL[c.flag]}
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                    完了
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-gray-600 whitespace-nowrap">{c.case_number}</td>
              <td className="px-3 py-2.5 min-w-[160px]">
                <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[280px]">
                  {c.deal_name}
                </Link>
                {(c.weeklyReportMissing || c.taskOverdue) && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {c.weeklyReportMissing && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />【重要】週次報告の漏れ
                      </span>
                    )}
                    {c.taskOverdue && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />【重要】タスク期限超過
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">{c.sales_name || <span className="text-gray-300">—</span>}</td>
              {/* 管理担当 */}
              <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">{c.manager_name || <span className="text-gray-300">—</span>}</td>
              {/* オーダーシート作成（未作成=— / 作成済=タブへのリンク） */}
              <td className="px-3 py-2.5">
                {c.order_sheet_completed_at ? (
                  <Link href={`/cases/${c.id}?tab=orderSheet`} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">作成済</Link>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              {/* 受注内容（手続区分） */}
              <td className="px-3 py-2.5">
                {c.procedure_type && c.procedure_type.filter(Boolean).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {c.procedure_type.filter(Boolean).map(p => (
                      <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                    ))}
                  </div>
                ) : <span className="text-gray-300">—</span>}
              </td>
              {/* 完了予定日 */}
              <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600 whitespace-nowrap">{c.expected_completion_date ?? <span className="text-gray-300">—</span>}</td>
              {/* 進捗: バー + 次の未完了タスク（クリックでタスクへ） */}
              <td className="px-3 py-2.5">
                {total > 0 ? (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-mono text-gray-400 flex-shrink-0">{done}/{total}</span>
                    </div>
                    {c.nextTaskId && c.nextTaskTitle ? (
                      <Link href={`/tasks/${c.nextTaskId}`} className="text-[11px] text-brand-600 hover:underline truncate block max-w-[180px] mt-0.5" title={c.nextTaskTitle}>
                        ▶ {c.nextTaskTitle}
                      </Link>
                    ) : (
                      <span className="text-[11px] text-gray-400 mt-0.5 block">未完了タスクなし</span>
                    )}
                  </div>
                ) : (
                  <span className="text-[12px] text-gray-300">—</span>
                )}
              </td>
              {/* 週次報告状況 */}
              <td className="px-3 py-2.5 text-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${WEEKLY_BADGE[weekly]}`}>{weekly}</span>
              </td>
              {/* 直近お客様報告日 */}
              <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600 whitespace-nowrap">{c.lastCommDate ?? <span className="text-gray-300">—</span>}</td>
              {/* やり取り詳細 */}
              <td className="px-3 py-2.5 text-[12px] text-gray-600 min-w-[200px] max-w-[320px]">
                {c.lastCommDetail ? (
                  <span className="line-clamp-2 whitespace-pre-line" title={c.lastCommDetail}>{c.lastCommDetail}</span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
      {compact && (
        <div className="px-4 py-2 text-center bg-gray-50/40 border-t border-gray-100">
          <Briefcase className="w-3 h-3 inline-block mr-1 text-gray-400" />
          <span className="text-[11px] text-gray-500">担当案件 {visibleRows.length} 件</span>
        </div>
      )}
      </div>

      {selectable && (
        <DeleteConfirmModal
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="案件の一括削除"
          message={`選択した ${selected.size} 件の案件を削除します。関連するタスク・担当者・書類・請求書・入金も全て削除され、取り消せません。本当に削除しますか？`}
          onConfirm={handleDeleteSelected}
        />
      )}
    </div>
  )
}
