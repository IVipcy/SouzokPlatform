'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Briefcase, Play, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Section, FieldGrid, Field, InlineSelect, InlineDate, InlineTextarea } from '@/components/ui/InlineFields'
import Badge from '@/components/ui/Badge'
import { getPhaseLabel, getPhaseColor } from '@/lib/phases'
import { TASK_STATUSES_V12, STATUS_FLOW_STEPS } from '@/lib/taskSectionDefs'
import { WORK_ROLES } from '@/lib/constants'
import TaskDetailSidebar from './TaskDetailSidebar'
import PrevTaskReviewSection from './PrevTaskReviewSection'
import NextTaskSelector from './NextTaskSelector'
import TaskCreatedDocsSection from './TaskCreatedDocsSection'

import { useCurrentMember } from '@/lib/useCurrentMember'
import type { TaskRow, MemberRow, CaseRow, CaseDocumentRow, CaseActivityRow, TaskDependencyRow, TaskTemplateRow, DocumentRow, HeirRow, RealEstatePropertyRow, ContractDocumentRow } from '@/types'

type Props = {
  task: TaskRow
  allMembers: MemberRow[]
  /** このタスクに紐づく書類のみ（サイドバー「関連ドキュメント」用） */
  documents: CaseDocumentRow[]
  /** 同一案件で作成した書類（documents テーブル）。「作成物」セクション用。 */
  createdDocuments?: DocumentRow[]
  activities: CaseActivityRow[]
  currentMemberId: string | null
  dependencies?: TaskDependencyRow[]
  caseTasks?: TaskRow[]
  /** タスクテンプレ（次タスク新規作成時の候補） */
  taskTemplates?: TaskTemplateRow[]
  /** AI書類作成モーダル用の案件付随データ */
  heirs?: HeirRow[]
  properties?: RealEstatePropertyRow[]
  contractDocuments?: ContractDocumentRow[]
}

const PRIORITIES = [
  { key: '通常', label: '通常' },
  { key: '急ぎ', label: '急ぎ' },
]

// ステータス正規化: 旧ステータスを新3段階に変換
// （差戻しは廃止済み。既存データの差戻しは「対応中」として扱う）
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

export default function TaskDetailClient({ task, allMembers, documents, createdDocuments = [], activities, currentMemberId: serverMemberId, dependencies = [], caseTasks = [], taskTemplates = [], heirs = [], properties = [], contractDocuments = [] }: Props) {
  const router = useRouter()
  const currentMemberId = useCurrentMember(serverMemberId)
  const caseData = task.cases
  const clientData = caseData?.clients

  // システムタスクは前後関係を持たないので、関連セクションを非表示
  const isSystemTask = task.task_kind === 'system'

  // 前段作業（task_completed 型依存の from_task）を抽出
  const prereqDeps = dependencies.filter(d => d.to_task_id === task.id && d.from_task)
  const hasPrereq = !isSystemTask && prereqDeps.some(d => d.condition_type === 'task_completed' && d.from_task)

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
              {/* ID + 区分バッジ + Phase + Category */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[13px] font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                  {task.id.slice(0, 8)}
                </span>
                {isSystemTask ? (
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                    受注担当/管理担当タスク
                  </span>
                ) : (
                  <span
                    className="text-[12px] font-semibold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: getPhaseColor(task.phase) }}
                  >
                    {getPhaseLabel(task.phase)}
                  </span>
                )}
                {task.category && (
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {task.category}
                  </span>
                )}
              </div>

              {/* タスク名（ラベル付き） */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[12px] font-semibold text-gray-400 tracking-wide flex-shrink-0">タスク名:</span>
                <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">
                  {task.title}
                </h1>
              </div>

              {/* 案件名（ラベル付き） + 手続き区分 */}
              {caseData && (
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-gray-400 tracking-wide flex-shrink-0">案件名:</span>
                    <Link
                      href={`/cases/${caseData.id}`}
                      className="text-[13px] text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1.5"
                    >
                      <Briefcase className="w-3.5 h-3.5" strokeWidth={2} />
                      {clientData?.name ?? caseData.deal_name} ({caseData.case_number})
                    </Link>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-gray-400 tracking-wide flex-shrink-0">手続き区分:</span>
                    <span className="text-[13px] text-gray-700">
                      {caseData.procedure_type && caseData.procedure_type.length > 0
                        ? caseData.procedure_type.join('・')
                        : <span className="text-gray-300 italic">未設定</span>}
                    </span>
                  </div>
                </div>
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
                    {advancing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4" strokeWidth={2.5} />}
                    {advancing ? '処理中...' : '着手する'}
                  </button>
                  <span className="text-[12px] text-gray-400 mt-0.5">作業を始める前に押す</span>
                </div>
              )}
              {currentStatus === '対応中' && (
                <div className="flex flex-col items-end">
                  <button
                    onClick={handleAdvance}
                    disabled={advancing}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all
                      ${advancing ? 'bg-brand-400 cursor-wait scale-95' : 'bg-brand-600 hover:bg-brand-700 hover:scale-105 active:scale-95'}`}
                  >
                    {advancing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />}
                    {advancing ? '処理中...' : '完了にする'}
                  </button>
                  <span className="text-[12px] text-gray-400 mt-0.5">完了条件を満たしたら押す</span>
                </div>
              )}
              {currentStatus === '完了' && (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold text-green-700 bg-green-50 border border-green-200">
                  <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
                  完了
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
                label={task.priority === '急ぎ' ? '急ぎ' : '通常'}
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
                  <span className={`text-[12px] whitespace-nowrap text-center ${isActive ? 'text-brand-600 font-semibold' : isPassed ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
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

      {/* 3カラムレイアウト
          左:  前タスク紐づけ + 前段作業の確認        (時系列: 過去)
          中央: 基本情報・作業内容・実施結果・作成物 (時系列: 現在)
          右:  次タスク紐づけ + タイムライン         (時系列: 未来) */}
      <div className="flex gap-5 lg:flex-row flex-col">
        {/* 左カラム — 前段 (システムタスクでは非表示) */}
        {!isSystemTask && (
          <aside className="w-full lg:w-[300px] lg:flex-shrink-0 flex flex-col gap-4">
            <div className="lg:sticky lg:top-[90px] flex flex-col gap-4">
              {/* このタスクの前のタスク（前段紐づけ） */}
              <NextTaskSelector
                currentTask={task}
                direction="prev"
                candidates={caseTasks.filter(t => t.id !== task.id && t.task_kind !== 'system')}
                linkedIds={new Set(dependencies.filter(d => d.to_task_id === task.id && d.condition_type === 'task_completed').map(d => d.from_task_id))}
                existingDeps={dependencies.filter(d => d.to_task_id === task.id && d.from_task)}
                taskTemplates={taskTemplates}
              />
              {/* 前段作業の確認（前提タスクがある場合のみ） */}
              {hasPrereq && (
                <PrevTaskReviewSection
                  task={task}
                  prereqDeps={prereqDeps}
                  currentMemberId={currentMemberId}
                />
              )}
            </div>
          </aside>
        )}

        {/* 中央カラム — メイン */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* 1. 基本情報（タスク件名 / Phase / カテゴリはヘッダーに記載されているので重複除外） */}
          <Section title="基本情報" icon="📝">
            <FieldGrid>
              <InlineDate label="タスク期限" value={task.due_date} onSave={v => saveField('due_date', v)} />
              <Field label="ステータス" value={currentStatus} mono />
              <Field label="起票日" value={task.issued_date ?? task.created_at?.slice(0, 10)} mono />
              <Field label="作業完了日" value={task.completed_at ?? '—'} mono />
              <InlineSelect
                label="優先度"
                value={task.priority}
                options={PRIORITIES.map(p => p.key)}
                onSave={v => saveField('priority', v)}
              />
              <InlineSelect
                label="タスク分類"
                value={WORK_ROLES.find(r => r.key === task.work_role)?.label ?? ''}
                options={WORK_ROLES.map(r => r.label)}
                onSave={async v => {
                  const key = WORK_ROLES.find(r => r.label === v)?.key ?? null
                  await saveField('work_role', key)
                }}
              />
            </FieldGrid>
            <div className="mt-2 space-y-2">
              <InlineTextarea label="備考" value={task.remarks ?? ''} onSave={v => saveField('remarks', v)} />
            </div>
          </Section>

          {/* 2. 着手者・作業履歴 */}
          <Section title="着手者・作業履歴" icon="👤">
            {/* 着手者表示 */}
            <div className="mb-3">
              {startedMember ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
                    style={{ backgroundColor: startedMember.avatar_color }}
                  >
                    {startedMember.name[0]}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{startedMember.name}</span>
                    <span className="text-[12px] text-gray-500 ml-2">
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
                <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-2">作業履歴</div>
                <div className="space-y-1.5">
                  {activities.map(act => (
                    <div key={act.id} className="flex items-start gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        act.activity_type === 'task_started' ? 'bg-green-500' :
                        act.activity_type === 'task_completed' ? 'bg-brand-500' :
                        act.activity_type === 'status_change' ? 'bg-amber-500' :
                        'bg-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-700">{act.description}</span>
                        <div className="text-[12px] text-gray-400">
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

          {/* 3. このタスクの作業内容 — 作業内容(procedure_text) + 実施結果 + 進捗メモ */}
          <TaskWorkSection
            task={task}
            saveField={saveField}
          />

          {/* 4. 作成物（documents テーブル。AI作成・アップロードともこのタスクに紐づく） */}
          <TaskCreatedDocsSection
            task={task}
            caseData={(task as unknown as { cases?: CaseRow }).cases as CaseRow}
            documents={createdDocuments}
            tasks={caseTasks}
            heirs={heirs}
            properties={properties}
            contractDocuments={contractDocuments}
          />
        </div>

        {/* 右カラム — 後続 */}
        <aside className="w-full lg:w-[300px] lg:flex-shrink-0">
          <TaskDetailSidebar
            task={task}
            documents={documents}
            dependencies={dependencies}
            caseTasks={caseTasks}
            taskTemplates={taskTemplates}
          />
        </aside>
      </div>
    </div>
  )
}

// =================== このタスクの作業内容セクション ===================
// 構成（全項目クリックで編集 → 外クリックで自動保存、保存ボタン無し）:
//   1. 作業内容 (tasks.procedure_text)  — テンプレ初期値 + 上書き可
//   2. 実施結果 (ext_data.execution_result) — 次タスクの前段確認で読み取られる
//   3. 作業進捗メモ (tasks.notes) — 本人の備忘録
function TaskWorkSection({
  task,
  saveField,
}: {
  task: TaskRow
  saveField: (field: string, value: unknown) => Promise<void>
  onRefresh?: () => void
}) {
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

  const handleSaveExecutionResult = async (next: string) => {
    const supabase = createClient()
    const nextExt = { ...ext, execution_result: next }
    const { error } = await supabase
      .from('tasks')
      .update({ ext_data: nextExt })
      .eq('id', task.id)
    if (error) throw error
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* セクションヘッダー */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">📝</span>
        <h2 className="text-[14px] font-bold text-gray-900">このタスクの作業内容</h2>
      </div>

      <div className="px-4 py-3 divide-y divide-gray-100">
        {/* 1. 作業内容 */}
        <div className="pb-3">
          <InlineTextarea
            label="作業内容"
            value={task.procedure_text ?? ''}
            onSave={v => saveField('procedure_text', v)}
          />
          <div className="text-[11px] text-gray-400 mt-0.5">
            タスクテンプレートの内容が初期値で入っています。このタスク用に上書きできます。
          </div>
        </div>

        {/* 2. 実施結果・引継ぎ事項 (システムタスクでは非表示) */}
        {task.task_kind !== 'system' && (
          <div className="py-3">
            <InlineTextarea
              label="実施結果・引継ぎ事項"
              value={typeof ext.execution_result === 'string' ? ext.execution_result : ''}
              onSave={handleSaveExecutionResult}
            />
            <div className="text-[11px] text-gray-400 mt-0.5">
              次のタスクの作業者が「前段作業の実施結果・引継ぎ事項」としてここを読みます。
            </div>
          </div>
        )}

        {/* 3. 作業進捗メモ */}
        <div className="pt-3">
          <InlineTextarea
            label="作業進捗メモ"
            value={task.notes ?? ''}
            onSave={v => saveField('notes', v)}
          />
          <div className="text-[11px] text-gray-400 mt-0.5">
            いつ何をやったのか、作業の進捗が分かるメモを記載
          </div>
        </div>
      </div>
    </section>
  )
}

