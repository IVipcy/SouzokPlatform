'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Section, FieldGrid, Field, InlineEdit, InlineSelect, InlineDate, InlineTextarea } from '@/components/ui/InlineFields'
import Badge from '@/components/ui/Badge'
import { getPhaseLabel, getPhaseColor } from '@/lib/phases'
import { TASK_STATUSES_V12, STATUS_FLOW_STEPS, TASK_CATEGORIES } from '@/lib/taskSectionDefs'
import { getCompletionCondition } from '@/lib/taskCompletionConditions'
import TaskCategorySections from './TaskCategorySections'
import TaskDetailSidebar from './TaskDetailSidebar'

import { useCurrentMember } from '@/lib/useCurrentMember'
import type { TaskRow, MemberRow, DocumentRow, CaseActivityRow, TaskDependencyRow } from '@/types'

type Props = {
  task: TaskRow
  allMembers: MemberRow[]
  documents: DocumentRow[]
  activities: CaseActivityRow[]
  currentMemberId: string | null
  dependencies?: TaskDependencyRow[]
  caseTasks?: TaskRow[]
}

const DB_PHASES = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']
const PRIORITIES = [
  { key: '通常', label: '通常' },
  { key: '急ぎ', label: '🚨 急ぎ' },
]

// ステータス正規化: 旧ステータスを新3段階に変換
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '差戻し', '保留'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

export default function TaskDetailClient({ task, allMembers, documents, activities, currentMemberId: serverMemberId, dependencies = [], caseTasks = [] }: Props) {
  const router = useRouter()
  const currentMemberId = useCurrentMember(serverMemberId)
  const caseData = task.cases
  const clientData = caseData?.clients

  const currentStatus = normalizeStatus(task.status)
  const currentStatusDef = TASK_STATUSES_V12.find(s => s.key === currentStatus)

  // ─── 保存ヘルパー ───
  const saveField = async (field: string, value: unknown) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ [field]: value ?? null }).eq('id', task.id)
    router.refresh()
  }



  // ─── ステータス進行 ───
  const [advancing, setAdvancing] = useState(false)

  const handleAdvance = useCallback(async () => {
    if (advancing) return
    setAdvancing(true)

    try {
      const supabase = createClient()
      const memberId = currentMemberId

      if (currentStatus === '着手前') {
        const updates: Record<string, unknown> = { status: '対応中' }
        if (memberId) {
          updates.started_by = memberId
          updates.started_at = new Date().toISOString()
        }
        const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
        if (error) { showToast(`エラー: ${error.message}`, 'error'); return }
        if (memberId) {
          await supabase.from('case_activities').insert({
            case_id: task.case_id, task_id: task.id, member_id: memberId,
            activity_type: 'task_started',
            description: `${task.title} に着手`,
            activity_date: new Date().toISOString().split('T')[0],
          })
        }
        showToast(`「${task.title}」に着手しました`)
      } else if (currentStatus === '対応中') {
        const { error } = await supabase.from('tasks').update({ status: '完了' }).eq('id', task.id)
        if (error) { showToast(`エラー: ${error.message}`, 'error'); return }
        if (memberId) {
          await supabase.from('case_activities').insert({
            case_id: task.case_id, task_id: task.id, member_id: memberId,
            activity_type: 'task_completed',
            description: `${task.title} を完了`,
            activity_date: new Date().toISOString().split('T')[0],
          })
        }
        showToast(`「${task.title}」を完了しました`)
      }
      router.refresh()
    } catch {
      showToast('通信エラーが発生しました', 'error')
    } finally {
      setAdvancing(false)
    }
  }, [advancing, currentMemberId, currentStatus, task, router])

  // ─── 着手者情報 ───
  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null

  // ─── ステータスフロー ───
  const currentFlowIdx = STATUS_FLOW_STEPS.indexOf(currentStatus)

  return (
    <div>
      {/* パンくず */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
          ← 戻る
        </button>
        <span className="text-gray-300">|</span>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <Link href="/tasks" className="hover:text-gray-600">タスク管理</Link>
          <span className="text-gray-300">›</span>
          <span className="text-gray-600 font-medium truncate max-w-[300px]">{task.title}</span>
        </div>
      </div>

      {/* ヘッダーカード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {/* ID + Phase + Category */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                  {task.id.slice(0, 8)}
                </span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: getPhaseColor(task.phase) }}
                >
                  {getPhaseLabel(task.phase)}
                </span>
                {task.category && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {task.category}
                  </span>
                )}
              </div>

              {/* タスク名 */}
              <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight mb-0.5">
                {task.title}
              </h1>

              {/* 案件リンク */}
              {caseData && (
                <Link
                  href={`/cases/${caseData.id}`}
                  className="text-[13px] text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                >
                  📋 {clientData?.name ?? caseData.deal_name} ({caseData.case_number})
                </Link>
              )}
            </div>

            {/* ステータス表示 + 進行ボタン + 優先度 */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {/* 進行ボタン */}
              {currentStatus === '着手前' && (
                <div className="flex flex-col items-end">
                  <button
                    onClick={handleAdvance}
                    disabled={advancing}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all
                      ${advancing ? 'bg-green-400 cursor-wait scale-95' : 'bg-green-600 hover:bg-green-700 hover:scale-105 active:scale-95'}`}
                  >
                    {advancing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '▶'}
                    {advancing ? '処理中...' : '着手する'}
                  </button>
                  <span className="text-[10px] text-gray-400 mt-0.5">作業を始める前に押す</span>
                </div>
              )}
              {currentStatus === '対応中' && (
                <div className="flex flex-col items-end">
                  <button
                    onClick={handleAdvance}
                    disabled={advancing}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all
                      ${advancing ? 'bg-blue-400 cursor-wait scale-95' : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95'}`}
                  >
                    {advancing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✅'}
                    {advancing ? '処理中...' : '完了にする'}
                  </button>
                  <span className="text-[10px] text-gray-400 mt-0.5">完了条件を満たしたら押す</span>
                </div>
              )}
              {currentStatus === '完了' && (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold text-green-700 bg-green-50 border border-green-200">
                  ✅ 完了
                </span>
              )}

              {/* 現在ステータス */}
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                style={{
                  color: currentStatusDef?.color,
                  borderColor: `${currentStatusDef?.color}40`,
                  backgroundColor: `${currentStatusDef?.color}10`,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentStatusDef?.color }} />
                {currentStatus}
              </span>

              <Badge
                label={task.priority === '急ぎ' ? '🚨 急ぎ' : '通常'}
                color={task.priority === '急ぎ' ? '#DC2626' : '#6B7280'}
                variant={task.priority === '急ぎ' ? 'solid' : undefined}
              />
            </div>
          </div>
        </div>

        {/* ステータスフロー（3段階） */}
        <div className="px-5 pb-4">
          <div className="flex items-start">
            {STATUS_FLOW_STEPS.map((step, i) => {
              const isPassed = currentFlowIdx >= 0 && i < currentFlowIdx
              const isActive = step === currentStatus
              const isLast = i === STATUS_FLOW_STEPS.length - 1
              const def = TASK_STATUSES_V12.find(s => s.key === step)
              return (
                <div key={step} className="flex flex-col items-center gap-1 flex-1 relative">
                  <div
                    className={`rounded-full relative z-10 transition-all ${isActive ? 'w-3 h-3 shadow-[0_0_0_3px_rgba(37,99,235,0.2)]' : 'w-2.5 h-2.5'}`}
                    style={{
                      backgroundColor: isActive ? (def?.color ?? '#2563EB') : isPassed ? '#059669' : '#CBD5E1',
                      opacity: isPassed && !isActive ? 0.6 : 1,
                    }}
                  />
                  <span className={`text-[10px] whitespace-nowrap text-center ${isActive ? 'text-blue-600 font-semibold' : isPassed ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                    {step}
                  </span>
                  {!isLast && (
                    <div
                      className="absolute top-[5px] left-[50%] right-[-50%] h-px z-0"
                      style={{ backgroundColor: isPassed ? '#059669' : '#CBD5E1', opacity: isPassed ? 0.5 : 1 }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 📄 書類作成リンク（全タスク共通） */}
      {caseData && (
        <div className="bg-white border border-indigo-200 rounded-xl mb-5 overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 flex items-center gap-2">
            <span className="text-white text-base">📄</span>
            <h2 className="text-white text-sm font-bold flex-1">書類作成</h2>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="text-2xl">🗂️</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-900">この案件の書類作成タブを開く</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                戸籍請求書・委任状・契約書・請求書など、案件データを元にExcel様式で作成できます
              </div>
            </div>
            <Link
              href={`/cases/${caseData.id}?tab=documentCreate`}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-sm whitespace-nowrap"
            >
              書類作成へ →
            </Link>
          </div>
        </div>
      )}

      {/* 👉 今やること カード（最優先で見せる） */}
      {(() => {
        const completionCondition = getCompletionCondition(task.template_key)
        if (!task.procedure_text && !completionCondition) return null
        return (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl overflow-hidden mb-5 shadow-sm">
            <div className="bg-blue-600 px-4 py-2">
              <h2 className="text-white text-sm font-bold flex items-center gap-2">
                <span className="text-base">👉</span> 今やること
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {/* 完了条件（一番重要） */}
              {completionCondition && (
                <div className="bg-white border border-green-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 text-lg leading-none mt-0.5">✅</span>
                    <div className="flex-1">
                      <div className="text-[11px] font-bold text-green-700 mb-1">
                        このタスクを「完了」にするタイミング
                      </div>
                      <p className="text-sm text-gray-800 font-medium leading-relaxed">
                        {completionCondition}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* 作業手順 */}
              {task.procedure_text && (
                <div className="bg-white border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 text-lg leading-none mt-0.5">📋</span>
                    <div className="flex-1">
                      <div className="text-[11px] font-bold text-blue-700 mb-1">
                        作業手順
                      </div>
                      <div className="text-[13px] text-gray-700 whitespace-pre-line leading-relaxed">
                        {task.procedure_text}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* 2カラムレイアウト */}
      <div className="flex gap-5">
        {/* 左カラム */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* 1. 基本情報 */}
          <Section title="基本情報" icon="📝">
            <FieldGrid>
              <InlineEdit label="タスク件名" value={task.title} onSave={v => saveField('title', v)} required />
              <Field label="起票日" value={task.issued_date ?? task.created_at?.slice(0, 10)} mono />
              <InlineDate label="期限" value={task.due_date} onSave={v => saveField('due_date', v)} />
              <Field label="ステータス" value={currentStatus} mono />
              <InlineSelect
                label="優先度"
                value={task.priority}
                options={PRIORITIES.map(p => p.key)}
                onSave={v => saveField('priority', v)}
              />
              <InlineSelect
                label="フェーズ"
                value={task.phase}
                options={DB_PHASES}
                onSave={v => saveField('phase', v)}
                renderValue={v => getPhaseLabel(v)}
              />
              <InlineSelect
                label="タスクカテゴリ"
                value={task.category ?? ''}
                options={TASK_CATEGORIES}
                onSave={v => saveField('category', v)}
              />
              <InlineSelect
                label="Wチェック担当"
                value={task.wcheck_by ?? ''}
                options={allMembers.map(m => m.name)}
                onSave={v => saveField('wcheck_by', v || null)}
              />
            </FieldGrid>
            <div className="mt-2 space-y-2">
              <InlineTextarea label="備考" value={task.remarks ?? ''} onSave={v => saveField('remarks', v)} />
              <InlineTextarea label="内部メモ" value={task.notes ?? ''} onSave={v => saveField('notes', v)} />
            </div>
          </Section>

          {/* 2. 着手者・作業履歴 */}
          <Section title="着手者・作業履歴" icon="👤">
            {/* 着手者表示 */}
            <div className="mb-3">
              {startedMember ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                    style={{ backgroundColor: startedMember.avatar_color }}
                  >
                    {startedMember.name[0]}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{startedMember.name}</span>
                    <span className="text-[10px] text-gray-500 ml-2">
                      {task.started_at ? `${new Date(task.started_at).toLocaleDateString('ja-JP')} 着手` : '着手中'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-500">まだ誰も着手していません</span>
                  {currentStatus === '着手前' && (
                    <button
                      onClick={handleAdvance}
                      className="ml-auto text-xs font-bold text-green-700 bg-green-100 hover:bg-green-200 border border-green-300 px-3 py-1 rounded-lg transition-colors"
                    >
                      ▶ 着手する
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* このタスクの活動履歴 */}
            {activities.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-gray-400 tracking-wide mb-2">作業履歴</div>
                <div className="space-y-1.5">
                  {activities.map(act => (
                    <div key={act.id} className="flex items-start gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        act.activity_type === 'task_started' ? 'bg-green-500' :
                        act.activity_type === 'task_completed' ? 'bg-blue-500' :
                        act.activity_type === 'status_change' ? 'bg-amber-500' :
                        'bg-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-700">{act.description}</span>
                        <div className="text-[10px] text-gray-400">
                          {act.members?.name && <span className="font-medium">{act.members.name}</span>}
                          {act.members?.name && ' — '}
                          {act.activity_date}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* 3. カテゴリ別セクション（作業内容） */}
          <TaskCategorySections task={task} onRefresh={() => router.refresh()} />
        </div>

        {/* 右カラム */}
        <div className="w-[320px] flex-shrink-0">
          <TaskDetailSidebar
            task={task}
            documents={documents}
            dependencies={dependencies}
          />
        </div>
      </div>
    </div>
  )
}
