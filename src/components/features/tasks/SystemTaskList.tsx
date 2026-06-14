'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Play, Loader2, AlertTriangle, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Badge from '@/components/ui/Badge'
import { getAssignRoleDef, CASE_STATUSES } from '@/lib/constants'
import type { TaskRow } from '@/types'

// お客様回答待ちのステータス（残り日数を出す対象）
const AWAITING_ANSWER = new Set(['検討中', '検討中（契約書待ち）', '面談設定済'])
function remainingDays(dueDate: string | null | undefined, status: string, today: string): number | null {
  if (!dueDate || !AWAITING_ANSWER.has(status)) return null
  return Math.round((new Date(dueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000)
}

type Props = {
  /** 表示対象のタスク（既に system タスクに絞られた配列） */
  tasks: TaskRow[]
  /** セクション見出し（既定: 「タスク」） */
  title?: string
  /** 0件時に表示するテキスト */
  emptyText?: string
  /** 案件カラムを出すか（案件詳細では非表示にする） */
  showCase?: boolean
  /** 完了タスクを表示するか（既定: 未完了のみ） */
  includeCompleted?: boolean
  /** 最大表示件数（超過時は「すべて見る」リンク） */
  limit?: number
  /** 「すべて見る」のリンク先 */
  seeAllHref?: string
  /** 閲覧中のメンバーID（着手＝引き取り時に started_by へ記録） */
  currentMemberId?: string
  /** 担当区分ラベル（受注担当/管理担当/両担当）を表示するか（チームタスク欄で使用） */
  showAssignRole?: boolean
  /** 案件の受注担当・管理担当名（case_id → 名前）。指定時は受注担当/管理担当の列を表示 */
  caseAssignees?: Record<string, { salesName: string | null; managerName: string | null }>
  /** チームタスク表示。案件ステータス/面談実施日/受注日/お客様回答予定日/残り日数/受注内容の列を追加し、
   *  作業内容列と担当区分ラベルは非表示にする。task.cases に該当フィールドが必要。 */
  teamMode?: boolean
  /** チェックボックスで選択して一括削除できるようにする（案件詳細のタスク一覧で使用） */
  selectable?: boolean
  /** カテゴリ列に担当区分（受注/管理担当・事務管理担当）を task_kind から表示する */
  showKindLabel?: boolean
  /** カテゴリ列自体を非表示にする（区分はタブで切り替える場合など） */
  hideCategory?: boolean
}

const STATUS_BADGE: Record<string, string> = {
  '着手前': 'bg-gray-100 text-gray-600 border-gray-200',
  '対応中': 'bg-sky-50  text-sky-700  border-sky-200',
  '完了':   'bg-green-50 text-green-700 border-green-200',
}

const CATEGORY_BADGE: Record<string, string> = {
  '面談':       'bg-amber-50  text-amber-700  border-amber-200',
  '契約':       'bg-purple-50 text-purple-700 border-purple-200',
  '初期対応':   'bg-sky-50    text-sky-700    border-sky-200',
  '定期進捗連絡': 'bg-pink-50  text-pink-700   border-pink-200',
}

const normalizeStatus = (s: string) => {
  if (s === '未着手') return '着手前'
  if (['Wチェック待ち', '保留'].includes(s)) return '対応中'
  if (s === 'キャンセル') return '完了'
  return s
}

/**
 * システムタスク用のフラットなリスト表示。
 * 案件タスクと違って前後関係を持たないので、シンプルなリストで OK。
 * クリックでタスク詳細へ、行内に着手/完了ボタンあり。
 */
export default function SystemTaskList({
  tasks,
  title = 'タスク',
  emptyText = 'タスクはありません',
  showCase = true,
  includeCompleted = false,
  limit,
  seeAllHref,
  currentMemberId,
  showAssignRole = false,
  caseAssignees,
  teamMode = false,
  selectable = false,
  showKindLabel = false,
  hideCategory = false,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const today = new Date().toISOString().split('T')[0]

  const visible = useMemo(() => {
    const filtered = includeCompleted
      ? tasks
      : tasks.filter(t => normalizeStatus(t.status) !== '完了')
    // ソート: 期限超過 → 期限近い順 → なし末尾
    return [...filtered].sort((a, b) => {
      const aOver = !!(a.due_date && a.due_date < today)
      const bOver = !!(b.due_date && b.due_date < today)
      if (aOver !== bOver) return aOver ? -1 : 1
      const ad = a.due_date ?? '9999-12-31'
      const bd = b.due_date ?? '9999-12-31'
      return ad.localeCompare(bd)
    })
  }, [tasks, includeCompleted, today])

  const shown = limit ? visible.slice(0, limit) : visible

  const handleAdvance = async (task: TaskRow) => {
    if (busyId) return
    const current = normalizeStatus(task.status)
    if (current === '完了') return
    setBusyId(task.id)
    try {
      const supabase = createClient()
      const next = current === '着手前' ? '対応中' : '完了'
      // 着手＝引き取り: started_by に自分を記録（未記録の場合のみ）
      const patch: { status: string; started_by?: string; started_at?: string } = { status: next }
      if (next === '対応中' && currentMemberId && !task.started_by) {
        patch.started_by = currentMemberId
        patch.started_at = new Date().toISOString()
      }
      const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
      if (error) throw error
      showToast(`「${task.title}」を${next === '対応中' ? '着手' : '完了'}しました`, 'success')
      startTransition(() => router.refresh())
    } catch (e) {
      console.error(e)
      showToast('エラーが発生しました', 'error')
    } finally {
      setBusyId(null)
    }
  }

  // ── 選択・一括削除（selectable のとき） ──
  const visibleIds = shown.map(t => t.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allSelected) visibleIds.forEach(id => next.delete(id))
    else visibleIds.forEach(id => next.add(id))
    return next
  })
  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`${selected.size}件のタスクを削除しますか？`)) return
    const supabase = createClient()
    const ids = [...selected]
    await supabase.from('task_assignees').delete().in('task_id', ids)
    const { error } = await supabase.from('tasks').delete().in('id', ids)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    showToast(`${ids.length}件のタスクを削除しました`, 'success')
    setSelected(new Set())
    startTransition(() => router.refresh())
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="inline-block w-1 h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
        <span className="text-[12px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {visible.length}
        </span>
        {selectable && selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] font-semibold text-gray-600">{selected.size}件選択中</span>
            <button type="button" onClick={deleteSelected} className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm transition-colors">
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2} /> 選択を削除
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] text-gray-400 hover:text-gray-600 px-1">解除</button>
          </div>
        )}
        {limit && visible.length > limit && seeAllHref && (
          <Link href={seeAllHref} className="ml-auto text-[12px] font-semibold text-brand-600 hover:text-brand-700">
            すべて見る →
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] text-gray-400">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500">
              <tr>
                {selectable && (
                  <th className="px-3 py-2 text-center w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 accent-brand-600 cursor-pointer" />
                  </th>
                )}
                {showCase && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件名</th>}
                {!hideCategory && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">カテゴリ</th>}
                <th className="px-3 py-2 text-left font-bold whitespace-nowrap">タスク名</th>
                <th className="px-3 py-2 text-left font-bold whitespace-nowrap">タスク期限</th>
                {teamMode && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件ステータス</th>}
                {teamMode && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">面談実施日</th>}
                {teamMode && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注日</th>}
                {teamMode && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">お客様回答予定日</th>}
                {teamMode && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">残り日数</th>}
                {teamMode && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注内容</th>}
                {!teamMode && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">作業内容</th>}
                {caseAssignees && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注担当</th>}
                {caseAssignees && <th className="px-3 py-2 text-left font-bold whitespace-nowrap">管理担当</th>}
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">ステータス</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(task => {
                const status = normalizeStatus(task.status)
                const isOverdue = !!(task.due_date && task.due_date < today && status !== '完了')
                const caseData = task.cases
                const isBusy = busyId === task.id
                // チームタスク表示では担当区分ラベルは出さない（カテゴリと混在して見づらいため）
                const assignDef = (showAssignRole && !teamMode) ? getAssignRoleDef(task.assign_role) : null
                const remain = teamMode ? remainingDays(caseData?.client_response_due_date, caseData?.status ?? '', today) : null
                const procedures = teamMode ? (caseData?.procedure_type ?? []).filter(Boolean) : []
                const caseStatusDef = teamMode ? CASE_STATUSES.find(s => s.key === caseData?.status) : null
                return (
                  <tr key={task.id} className={`hover:bg-gray-50/60 ${selected.has(task.id) ? 'bg-brand-50/40' : isOverdue ? 'bg-red-50/30' : ''}`}>
                    {selectable && (
                      <td className="px-3 py-2.5 align-top text-center">
                        <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggleOne(task.id)} className="w-3.5 h-3.5 accent-brand-600 cursor-pointer" />
                      </td>
                    )}
                    {/* 案件名 */}
                    {showCase && (
                      <td className="px-3 py-2.5 align-top">
                        {caseData ? (
                          <Link href={`/cases/${caseData.id}`} className="text-[12px] text-gray-600 hover:text-brand-600 hover:underline truncate block max-w-[160px]">
                            {caseData.deal_name}
                          </Link>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* カテゴリ（＋担当区分ラベル） */}
                    {!hideCategory && (
                    <td className="px-3 py-2.5 align-top whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        {showKindLabel && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${task.task_kind === 'system' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                            {task.task_kind === 'system' ? '受注/管理担当' : '事務管理担当'}
                          </span>
                        )}
                        {task.category && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[task.category] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {task.category}
                          </span>
                        )}
                        {assignDef && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${assignDef.pill}`}>
                            {assignDef.label}
                          </span>
                        )}
                      </div>
                    </td>
                    )}
                    {/* タスク名 */}
                    <td className="px-3 py-2.5 align-top">
                      <Link
                        href={`/tasks/${task.id}`}
                        className={`text-[13px] font-semibold hover:text-brand-600 hover:underline block max-w-[220px] truncate ${status === '完了' ? 'text-gray-400 line-through' : 'text-gray-800'}`}
                        title={task.title}
                      >
                        {task.title}
                      </Link>
                    </td>
                    {/* タスク期限 */}
                    <td className="px-3 py-2.5 align-top whitespace-nowrap font-mono text-[12px]">
                      {task.due_date ? (
                        <span className={isOverdue ? 'text-red-600 font-bold inline-flex items-center gap-0.5' : 'text-gray-600'}>
                          {isOverdue && <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />}
                          {task.due_date}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* ── チームタスク用の案件コンテキスト列 ── */}
                    {teamMode && (
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        {caseStatusDef ? <Badge label={caseStatusDef.label} color={caseStatusDef.color} /> : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {teamMode && (
                      <td className="px-3 py-2.5 align-top whitespace-nowrap font-mono text-[12px] text-gray-600">{caseData?.meeting_executed_date ?? <span className="text-gray-300">—</span>}</td>
                    )}
                    {teamMode && (
                      <td className="px-3 py-2.5 align-top whitespace-nowrap font-mono text-[12px] text-gray-600">{caseData?.order_received_date ?? <span className="text-gray-300">—</span>}</td>
                    )}
                    {teamMode && (
                      <td className="px-3 py-2.5 align-top whitespace-nowrap font-mono text-[12px] text-gray-600">{caseData?.client_response_due_date ?? <span className="text-gray-300">—</span>}</td>
                    )}
                    {teamMode && (
                      <td className="px-3 py-2.5 align-top whitespace-nowrap font-mono text-[12px]">
                        {remain === null ? <span className="text-gray-300">—</span>
                          : remain < 0 ? <span className="text-red-600 font-bold">{Math.abs(remain)}日超過</span>
                          : remain === 0 ? <span className="text-amber-600 font-bold">本日</span>
                          : <span className={remain <= 3 ? 'text-amber-600 font-semibold' : 'text-gray-700'}>あと{remain}日</span>}
                      </td>
                    )}
                    {teamMode && (
                      <td className="px-3 py-2.5 align-top">
                        {procedures.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {procedures.map(p => (
                              <span key={p} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                            ))}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* 作業内容（チームタスクでは非表示） */}
                    {!teamMode && (
                      <td className="px-3 py-2.5 align-top">
                        {task.procedure_text ? (
                          <p
                            className="text-[12px] text-gray-500 leading-snug max-w-[280px] overflow-hidden"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                            title={task.procedure_text}
                          >
                            {task.procedure_text}
                          </p>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* 受注担当・管理担当（案件の担当者） */}
                    {caseAssignees && (
                      <td className="px-3 py-2.5 align-top text-[12px] text-gray-700 whitespace-nowrap">
                        {caseAssignees[task.case_id]?.salesName || <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {caseAssignees && (
                      <td className="px-3 py-2.5 align-top text-[12px] text-gray-700 whitespace-nowrap">
                        {caseAssignees[task.case_id]?.managerName || <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* ステータス（対応中は引き取り者名を併記） */}
                    <td className="px-3 py-2.5 align-top text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {status === '対応中' && task.started_by_member
                          ? `対応中（${task.started_by_member.name}）`
                          : status}
                      </span>
                    </td>
                    {/* 着手/完了ボタン */}
                    <td className="px-3 py-2.5 align-top text-center whitespace-nowrap">
                      {status !== '完了' && (
                        <button
                          type="button"
                          onClick={() => handleAdvance(task)}
                          disabled={isBusy}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold disabled:opacity-50 transition-colors ${
                            status === '着手前'
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                              : 'text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100'
                          }`}
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> :
                            status === '着手前' ? <Play className="w-3 h-3" strokeWidth={2.5} /> : <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />}
                          {status === '着手前' ? '着手' : '完了'}
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
    </section>
  )
}
