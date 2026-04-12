'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Section, FieldGrid, Field, InlineEdit, InlineSelect, InlineDate, InlineTextarea } from '@/components/ui/InlineFields'
import Badge from '@/components/ui/Badge'
import { getPhaseLabel, getPhaseColor } from '@/lib/phases'
import { TASK_STATUSES_V12, STATUS_FLOW_STEPS, TASK_CATEGORIES } from '@/lib/taskSectionDefs'
import TaskCategorySections from './TaskCategorySections'
import TaskDetailSidebar from './TaskDetailSidebar'
import type { TaskRow, MemberRow, DocumentRow, CaseActivityRow } from '@/types'

type Props = {
  task: TaskRow
  allMembers: MemberRow[]
  documents: DocumentRow[]
  activities: CaseActivityRow[]
  currentMemberId: string | null
}

const DB_PHASES = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']
const PRIORITIES = [
  { key: '通常', label: '通常' },
  { key: '急ぎ', label: '🚨 急ぎ' },
]

export default function TaskDetailClient({ task, allMembers, documents, activities, currentMemberId }: Props) {
  const router = useRouter()
  const caseData = task.cases
  const clientData = caseData?.clients

  // ─── ステータスドロップダウン ───
  const [statusOpen, setStatusOpen] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)
  const currentStatusDef = TASK_STATUSES_V12.find(s => s.key === task.status)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
    }
    if (statusOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [statusOpen])

  // ─── 保存ヘルパー ───
  const saveField = async (field: string, value: unknown) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ [field]: value ?? null }).eq('id', task.id)
    router.refresh()
  }

  const handleStatusChange = async (newStatus: string) => {
    setStatusOpen(false)
    if (newStatus === task.status) return
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    // 活動履歴
    if (currentMemberId) {
      await supabase.from('case_activities').insert({
        case_id: task.case_id,
        task_id: task.id,
        member_id: currentMemberId,
        activity_type: 'status_change',
        description: `${task.title} を「${newStatus}」に変更`,
        activity_date: new Date().toISOString().split('T')[0],
      })
    }
    router.refresh()
  }

  // ─── 着手する ───
  const handleStart = async () => {
    if (!currentMemberId) return
    const supabase = createClient()
    await supabase.from('tasks').update({
      status: '対応中',
      started_by: currentMemberId,
      started_at: new Date().toISOString(),
    }).eq('id', task.id)
    await supabase.from('case_activities').insert({
      case_id: task.case_id,
      task_id: task.id,
      member_id: currentMemberId,
      activity_type: 'task_started',
      description: `${task.title} に着手`,
      activity_date: new Date().toISOString().split('T')[0],
    })
    router.refresh()
  }

  // ─── 完了にする ───
  const handleComplete = async () => {
    const supabase = createClient()
    await supabase.from('tasks').update({ status: '完了' }).eq('id', task.id)
    if (currentMemberId) {
      await supabase.from('case_activities').insert({
        case_id: task.case_id,
        task_id: task.id,
        member_id: currentMemberId,
        activity_type: 'task_completed',
        description: `${task.title} を完了`,
        activity_date: new Date().toISOString().split('T')[0],
      })
    }
    router.refresh()
  }

  // ─── 着手者情報 ───
  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null

  // ─── ステータスフロー ───
  const currentFlowIdx = STATUS_FLOW_STEPS.indexOf(task.status)

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

            {/* ステータス + 優先度 + 着手ボタン */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {/* 着手/完了ボタン */}
              {task.status === '未着手' && !task.started_by && (
                <button
                  onClick={handleStart}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 transition-colors shadow-sm"
                >
                  ▶ 着手する
                </button>
              )}
              {task.status === '対応中' && (
                <button
                  onClick={handleComplete}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                >
                  ✅ 完了にする
                </button>
              )}

              <div className="relative" ref={statusRef}>
                <button
                  onClick={() => setStatusOpen(!statusOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors"
                  style={{
                    color: currentStatusDef?.color,
                    borderColor: `${currentStatusDef?.color}40`,
                    backgroundColor: `${currentStatusDef?.color}10`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentStatusDef?.color }} />
                  {task.status}
                  <span className="text-[10px] opacity-70">▾</span>
                </button>

                {statusOpen && (
                  <div className="absolute top-full right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] z-50 overflow-hidden">
                    {TASK_STATUSES_V12.map(s => (
                      <button
                        key={s.key}
                        onClick={() => handleStatusChange(s.key)}
                        className={`w-full px-3.5 py-2 text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                          s.key === task.status ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                        }`}
                      >
                        <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        {s.key}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Badge
                label={task.priority === '急ぎ' ? '🚨 急ぎ' : '通常'}
                color={task.priority === '急ぎ' ? '#DC2626' : '#6B7280'}
                variant={task.priority === '急ぎ' ? 'solid' : undefined}
              />
            </div>
          </div>
        </div>

        {/* ステータスフロー */}
        <div className="px-5 pb-4">
          <div className="flex items-start">
            {STATUS_FLOW_STEPS.map((step, i) => {
              const isPassed = currentFlowIdx >= 0 && i < currentFlowIdx
              const isActive = step === task.status
              const isLast = i === STATUS_FLOW_STEPS.length - 1
              const def = TASK_STATUSES_V12.find(s => s.key === step)
              return (
                <div key={step} className="flex flex-col items-center gap-1 flex-1 relative">
                  <div
                    className={`rounded-full relative z-10 transition-all ${isActive ? 'w-3 h-3 shadow-[0_0_0_3px_rgba(37,99,235,0.2)]' : 'w-2.5 h-2.5'}`}
                    style={{
                      backgroundColor: isActive ? (def?.color ?? '#2563EB') : isPassed ? '#2563EB' : '#CBD5E1',
                      opacity: isPassed && !isActive ? 0.4 : 1,
                    }}
                  />
                  <span className={`text-[10px] whitespace-nowrap text-center ${isActive ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                    {step}
                  </span>
                  {!isLast && (
                    <div
                      className="absolute top-[5px] left-[50%] right-[-50%] h-px z-0"
                      style={{ backgroundColor: isPassed ? '#2563EB' : '#CBD5E1', opacity: isPassed ? 0.35 : 1 }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

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
              <InlineSelect
                label="ステータス"
                value={task.status}
                options={TASK_STATUSES_V12.map(s => s.key)}
                onSave={v => saveField('status', v)}
              />
              <InlineSelect
                label="優先度"
                value={task.priority}
                options={PRIORITIES.map(p => p.key)}
                onSave={v => saveField('priority', v)}
              />
            </FieldGrid>
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
                  {task.status === '未着手' && (
                    <button
                      onClick={handleStart}
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

          {/* 3. 内容・分類 */}
          <Section title="内容・分類" icon="📂">
            <FieldGrid>
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
            </FieldGrid>
            <div className="mt-2">
              <InlineTextarea label="表題（作業内容）" value={task.notes ?? ''} onSave={v => saveField('notes', v)} />
            </div>
            <div className="mt-1">
              <InlineTextarea label="備考" value={task.remarks ?? ''} onSave={v => saveField('remarks', v)} />
            </div>
          </Section>

          {/* 4. カテゴリ別セクション */}
          <TaskCategorySections task={task} onRefresh={() => router.refresh()} />

          {/* 5. 作業手順 */}
          {task.procedure_text && (
            <Section title="作業手順" icon="📋">
              <div className="bg-gray-50 rounded-lg p-4 text-[13px] text-gray-700 whitespace-pre-line leading-relaxed border border-gray-100">
                {task.procedure_text}
              </div>
            </Section>
          )}
        </div>

        {/* 右カラム */}
        <div className="w-[320px] flex-shrink-0">
          <TaskDetailSidebar task={task} documents={documents} />
        </div>
      </div>
    </div>
  )
}
