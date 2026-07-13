'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Briefcase, Play, CheckCircle2, ExternalLink, ChevronDown, ChevronUp, Check, FileText, Package, PackageCheck } from 'lucide-react'
import { GYOMU_TAB } from '@/lib/serviceMaster'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Section, FieldGrid, Field, InlineSelect, InlineDate, InlineTextarea } from '@/components/ui/InlineFields'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import CompleteTaskModal from './CompleteTaskModal'
import { getStartSignal, isWaitingReceipt, receiptWaitNote } from '@/lib/taskReadiness'
import { isFinanceFreezeTask } from '@/lib/financeFreeze'
import { getPhaseLabel } from '@/lib/phases'
import { TASK_STATUSES_V12, STATUS_FLOW_STEPS } from '@/lib/taskSectionDefs'
import TaskDetailSidebar from './TaskDetailSidebar'
import PrevTaskReviewSection from './PrevTaskReviewSection'
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
  /** 案件に凍結未確認の金融資産があるか（金融タスクの着手ハード制限） */
  financeFreezeBlocked?: boolean
}

const PRIORITIES = [
  { key: '通常', label: '通常' },
  { key: '急ぎ', label: '急ぎ' },
]

// ステータス正規化: 旧ステータスを新3段階に変換
// （差戻しは廃止済み。既存データの差戻しは「対応中」として扱う）
// 作業内容エリア（テンプレ流し込みは廃止。空欄から自由記入）
const SHOW_WORK_CONTENT = true

const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

export default function TaskDetailClient({ task, allMembers, documents, createdDocuments = [], activities, currentMemberId: serverMemberId, dependencies = [], caseTasks = [], taskTemplates = [], heirs = [], properties = [], contractDocuments = [], financeFreezeBlocked = false }: Props) {
  const router = useRouter()
  const currentMemberId = useCurrentMember(serverMemberId)
  const caseData = task.cases
  const clientData = caseData?.clients

  // システムタスクは前後関係を持たないので、関連セクションを非表示
  const isSystemTask = task.task_kind === 'system'

  // 前段確認の表示判定（実体のある前段だけ）：①完了ゲートでこのタスクを着手OKにした
  // 元タスクがある、または ②同じ業務区分で完了したタスクがある
  const hasPrevContext = !isSystemTask && (() => {
    const readyFrom = (task.ext_data as { ready_from_task_id?: string } | null)?.ready_from_task_id
    if (readyFrom && caseTasks.some(t => t.id === readyFrom && t.status === '完了')) return true
    return caseTasks.some(t => t.id !== task.id && t.status === '完了' && t.phase === task.phase)
  })()

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
  // 完了ゲート（実施結果＋次に着手OKにするタスク選択）
  const [completeOpen, setCompleteOpen] = useState(false)
  // 着手OKは「次やる目印」（ソフト）。着手OKでなくても着手はできる。
  // 着手不可（ハード制限）は口座凍結未確認の金融タスクのみ。
  const startSignal = getStartSignal(task)
  const freezeBlocked = !isSystemTask && financeFreezeBlocked && isFinanceFreezeTask(task)
  const canStart = !freezeBlocked
  const waiting = !isSystemTask && isWaitingReceipt(task)
  // 未着手のタスクを開いたら「着手しますか？（着手する/閲覧だけ）」を出す。
  // 事務管理タスクに加え、初期対応タスク（受注時に生成される system タスク）も対象。
  const isInitialTask = task.category === '初期対応'
  const [startPromptOpen, setStartPromptOpen] = useState(currentStatus === '着手前' && (!isSystemTask || isInitialTask))

  const handleAdvance = useCallback(async () => {
    if (advancing) return
    // 事務管理タスクの完了は完了ゲートを通す
    if (currentStatus === '対応中' && task.task_kind !== 'system') {
      setCompleteOpen(true)
      return
    }
    // 金融資産調査・解約タスクは、口座凍結が未確認だと着手不可（ハード制限）
    if (currentStatus === '着手前' && financeFreezeBlocked && isFinanceFreezeTask(task)) {
      showToast('口座の凍結確認が未完了です。財産調査タブで管理担当が凍結確認すると着手できます', 'error')
      return
    }
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
        // ここに来るのは受注/管理担当(system)タスクのみ（事務管理タスクは完了ゲートへ）
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
  }, [advancing, currentMemberId, currentStatus, task, router, financeFreezeBlocked])

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
                ) : task.phase ? (
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-[5px] bg-brand-50 text-brand-700">
                    {getPhaseLabel(task.phase).replace(/^Phase\d+[:：]\s*/, '')}
                  </span>
                ) : null}
                {task.category && task.category !== task.phase && (
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
                    disabled={advancing || !canStart}
                    title={canStart ? undefined : '口座の凍結確認が未完了です'}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all
                      ${!canStart ? 'bg-gray-300 cursor-not-allowed' : advancing ? 'bg-green-400 cursor-wait scale-95' : 'bg-green-600 hover:bg-green-700 hover:scale-105 active:scale-95'}`}
                  >
                    {advancing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4" strokeWidth={2.5} />}
                    {advancing ? '処理中...' : '着手する'}
                  </button>
                  <span className="text-[12px] text-gray-400 mt-0.5">{canStart ? '作業を始める前に押す' : '口座の凍結確認後に押せます'}</span>
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
        {/* 左カラム — 前段確認（同フェーズ→無ければ前フェーズの最新完了タスクを自動表示。無ければ非表示） */}
        {hasPrevContext && (
          <aside className="w-full lg:w-[300px] lg:flex-shrink-0 flex flex-col gap-4">
            <div className="lg:sticky lg:top-[90px] flex flex-col gap-4">
              <PrevTaskReviewSection
                task={task}
                caseTasks={caseTasks}
                currentMemberId={currentMemberId}
              />
            </div>
          </aside>
        )}

        {/* 中央カラム — メイン */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* 案件サマリー — 他人が引き継いだとき、この案件と業務の現在地を10秒で把握（幅を他セクションに合わせる） */}
          {caseData && (
            <CaseSummaryPanel
              caseData={caseData}
              taskPhase={task.phase}
              caseTasks={caseTasks}
              currentTaskId={task.id}
            />
          )}

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
            </FieldGrid>
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

          {/* 3. このタスクの作業内容 — 現時点では全タスク（初期対応・事務管理とも）で非表示（今後再開予定） */}
          {SHOW_WORK_CONTENT && (
            <TaskWorkSection
              task={task}
              saveField={saveField}
            />
          )}

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

      {/* 完了ゲート（実施結果＋次に着手OKにするタスク選択） */}
      {completeOpen && (
        <CompleteTaskModal
          task={task}
          onClose={() => setCompleteOpen(false)}
          onCompleted={() => { setCompleteOpen(false); router.refresh() }}
        />
      )}

      {/* 着手ポップアップ（未着手の事務管理タスクを開いたとき） */}
      {startPromptOpen && (
        <Modal
          isOpen
          onClose={() => setStartPromptOpen(false)}
          title="このタスクに着手しますか？"
          maxWidth="max-w-sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setStartPromptOpen(false)}>着手しない（閲覧だけ）</Button>
              <Button variant="primary" disabled={!canStart || advancing} onClick={async () => { await handleAdvance(); setStartPromptOpen(false) }}>
                <Play className="w-4 h-4" /> 着手する
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="text-[13px] font-semibold text-gray-800">「{task.title}」</div>
            {freezeBlocked ? (
              <div className="flex items-start gap-2 text-[12.5px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Package className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" strokeWidth={2} />
                <span>口座の<strong className="font-semibold">凍結確認が未完了</strong>です。財産調査タブで管理担当が凍結確認すると着手できます。</span>
              </div>
            ) : isInitialTask ? (
              <div className="flex items-start gap-2 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <PackageCheck className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
                <span>着手すると「対応中」になり、担当として記録されます。内容の確認だけなら「着手しない（閲覧だけ）」で閉じてください。</span>
              </div>
            ) : startSignal.ready ? (
              <div className="flex items-start gap-2 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <PackageCheck className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
                <span>着手OK{startSignal.reason ? `：${startSignal.reason}` : ''}。着手すると「対応中」になります。</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-[12.5px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Package className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" strokeWidth={2} />
                <span>{waiting ? <>受領次第OK{receiptWaitNote(task) ? `（${receiptWaitNote(task)}）` : ''}の目印が付いています。</> : <>着手OKの目印は付いていません。</>}そのまま着手しても問題ありません。</span>
              </div>
            )}
          </div>
        </Modal>
      )}
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
    <div className="space-y-3">
      {/* このタスクの作業内容（空欄から自由記入。テンプレの自動流し込みは廃止） */}
      <Section title="このタスクの作業内容">
        <InlineTextarea
          label="作業内容"
          value={task.procedure_text ?? ''}
          onSave={v => saveField('procedure_text', v)}
        />
        <div className="text-[11px] text-gray-400 mt-1">
          このタスクの作業内容・備考を自由に記入してください。
        </div>
      </Section>

      {/* 実施結果・引継ぎ事項（重要なので独立セクション。システムタスクでは非表示） */}
      {task.task_kind !== 'system' && (
        <Section title="実施結果・引継ぎ事項">
          <InlineTextarea
            label="実施結果・引継ぎ事項"
            value={typeof ext.execution_result === 'string' ? ext.execution_result : ''}
            onSave={handleSaveExecutionResult}
          />
          <div className="text-[11px] text-gray-400 mt-1">
            タスク完了時に「案件進捗 → 進捗メモ」へ自動で追記されます（タスクへのリンク付き）。次の作業者もここを読みます。
            <span className="text-amber-600 font-medium">※完了するには入力が必須です。</span>
          </div>
        </Section>
      )}
    </div>
  )
}

// タスク詳細の上部に表示する「案件サマリー」パネル。
// このタスクが属する業務（gyomu）にフォーカスして、
//   - 完了したタスクの実施結果（タイムライン）
//   - 未着手・対応中のタスク
// を出し、引き継ぎ時に「この戦場で何が起きてた？」を即把握できるようにする。
// 必要なら「案件全体の直近の動き」を折りたたみで展開できる。
function CaseSummaryPanel({ caseData, taskPhase, caseTasks, currentTaskId }: {
  caseData: CaseRow
  taskPhase: string | null
  caseTasks: TaskRow[]
  /** 今開いているタスク。一覧から自分自身を除外するため。 */
  currentTaskId: string
}) {
  const [globalOpen, setGlobalOpen] = useState(false)
  const normalize = (s: string) => {
    if (s === '未着手') return '着手前'
    if (['Wチェック待ち', '保留', '差戻し'].includes(s)) return '対応中'
    if (s === 'キャンセル') return '完了'
    return s
  }
  // 業務区分の正規化: "PhaseN:" 接頭辞を除き、旧Phase値(phase1..6)や空は「未分類」に寄せる。
  const stripPhasePrefix = (s: string) => {
    const g = s.replace(/^Phase\d+[:：]\s*/, '').trim()
    if (!g || /^phase\d+$/i.test(g)) return '未分類'
    return g
  }
  const currentGyomu = taskPhase ? stripPhasePrefix(taskPhase) : null
  const targetTab = currentGyomu ? GYOMU_TAB[currentGyomu] : null
  const targetTabLabel: Record<string, string> = {
    deceased: '相続人調査', assets: '財産調査', division: '遺産分割', will: '遺言',
    registration: '相続登記', cancellation: '解約手続', trust: '信託契約',
    renunciation: '相続放棄', mediation: '調停', probate: '遺言検認',
    guardianship: '成年後見', referral: '他事業者紹介', contractProc: '郵送書類確認',
  }

  // 事務管理タスク（task_kind='case'）かつ同じ業務区分のもの。進捗カウントには現タスクも含める。
  const gyomuTasks = caseTasks
    .filter(t => t.task_kind !== 'system' && currentGyomu && stripPhasePrefix(t.phase ?? '') === currentGyomu)

  // 一覧表示は「今開いているタスク」を除外（自分自身は出さない）
  const otherTasks = gyomuTasks.filter(t => t.id !== currentTaskId)
  const doneTasks = otherTasks
    .filter(t => normalize(t.status) === '完了')
    .sort((a, b) => (b.completed_at ?? b.updated_at ?? '').localeCompare(a.completed_at ?? a.updated_at ?? ''))
  const doingTasks = otherTasks.filter(t => normalize(t.status) === '対応中')
  const todoTasks = otherTasks.filter(t => normalize(t.status) === '着手前')

  // 案件全体（業務横断）の直近活動: 事務管理タスク（task_kind='case'）のみをタイムライン化。
  // 受注担当/管理担当の初期対応タスク（task_kind/phase='system'）は対象外。
  type Event = { kind: 'completed' | 'started'; at: string; task: TaskRow }
  const events: Event[] = []
  for (const t of caseTasks) {
    if (t.task_kind !== 'case') continue
    if (t.completed_at) events.push({ kind: 'completed', at: t.completed_at, task: t })
    if (t.started_at) events.push({ kind: 'started', at: t.started_at, task: t })
  }
  events.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div>
    <Section title="案件サマリー">
      {/* 業務フォーカス */}
      {currentGyomu ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-block w-[3px] h-3.5 bg-brand-600 rounded-[1px]" />
            <span className="text-[13px] font-bold text-gray-900">{currentGyomu === 'system' ? '受注/管理担当' : currentGyomu}</span>
            <span className="text-[11px] font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
              {doneTasks.length}/{gyomuTasks.length} 完了
            </span>
            <span className="text-[11px] text-gray-400">{currentGyomu === 'system' ? '受注/管理担当の初期対応タスク' : 'この業務の事務管理タスク'}</span>
            {targetTab && (
              <Link
                href={`/cases/${caseData.id}?tab=${targetTab}`}
                className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 px-2.5 py-1 rounded border border-brand-200"
              >
                {targetTabLabel[targetTab] ?? targetTab} タブを開く
                <ExternalLink className="w-3 h-3" strokeWidth={2.25} />
              </Link>
            )}
          </div>

          {/* これまでの作業（完了タスク + 実施結果） */}
          {doneTasks.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5 tracking-wide">これまでの作業</div>
              <ul className="space-y-1.5">
                {doneTasks.slice(0, 5).map(t => {
                  const ext = (t.ext_data ?? {}) as Record<string, unknown>
                  const result = typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
                  return (
                    <li key={t.id} className="flex items-start gap-2 text-[12px]">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <Link href={`/tasks/${t.id}`} className="font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate">{t.title}</Link>
                          <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">{(t.completed_at ?? '').slice(0, 10)}</span>
                          {t.started_by_member?.name && <span className="text-[10px] text-gray-500 truncate flex-shrink-0">{t.started_by_member.name}</span>}
                        </div>
                        {/* 実施結果・引継ぎ事項（空なら記載なしを明示） */}
                        {result ? (
                          <div className="mt-0.5 text-[11px] text-gray-600 line-clamp-3 whitespace-pre-line bg-gray-50 px-2 py-1 rounded">{result}</div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-gray-400 italic">実施結果・引継ぎ事項の記載なし</div>
                        )}
                      </div>
                    </li>
                  )
                })}
                {doneTasks.length > 5 && (
                  <li className="text-[11px] text-gray-400 pl-5.5">ほか {doneTasks.length - 5} 件</li>
                )}
              </ul>
            </div>
          )}

          {/* 進行中・残作業 */}
          {(doingTasks.length > 0 || todoTasks.length > 0) && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5 tracking-wide">進行中・残作業</div>
              <ul className="space-y-1">
                {doingTasks.map(t => (
                  <li key={t.id} className="flex items-center gap-2 text-[12px]">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                    <Link href={`/tasks/${t.id}`} className="text-gray-800 hover:text-brand-600 hover:underline truncate">{t.title}</Link>
                    <span className="text-[10px] font-mono text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">対応中</span>
                    {t.due_date && <span className="text-[10px] font-mono text-gray-400 ml-auto flex-shrink-0">期限 {t.due_date}</span>}
                  </li>
                ))}
                {todoTasks.map(t => (
                  <li key={t.id} className="flex items-center gap-2 text-[12px]">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    <Link href={`/tasks/${t.id}`} className="text-gray-700 hover:text-brand-600 hover:underline truncate">{t.title}</Link>
                    {t.due_date && <span className="text-[10px] font-mono text-gray-400 ml-auto flex-shrink-0">期限 {t.due_date}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {otherTasks.length === 0 && (
            <div className="text-[12px] text-gray-400">この業務には、今開いているタスク以外のタスクはありません</div>
          )}
        </div>
      ) : (
        <div className="text-[12px] text-gray-400">業務が紐づいていません（システムタスク等）</div>
      )}

      {/* 案件全体の直近の動き（折りたたみ） */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setGlobalOpen(o => !o)}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700"
        >
          {globalOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          案件全体の直近の動きを{globalOpen ? '閉じる' : '見る'}
          <span className="text-[10px] font-mono text-gray-400">（{events.length} 件）</span>
        </button>
        {globalOpen && (
          <div className="mt-2">
            {events.length === 0 ? (
              <div className="text-[11px] text-gray-400">まだ動きはありません</div>
            ) : (
              <ul className="space-y-1">
                {events.slice(0, 12).map((e, i) => (
                  <li key={`${e.task.id}-${e.kind}-${i}`} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-gray-400 w-20 flex-shrink-0">{e.at.slice(0, 10)}</span>
                    {e.kind === 'completed' ? (
                      <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" strokeWidth={2.5} />
                    ) : (
                      <FileText className="w-3 h-3 text-brand-500 flex-shrink-0" strokeWidth={2.25} />
                    )}
                    {e.task.phase && (
                      <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded flex-shrink-0">{stripPhasePrefix(e.task.phase)}</span>
                    )}
                    <Link href={`/tasks/${e.task.id}`} className="text-gray-700 hover:text-brand-600 hover:underline truncate">
                      {e.task.title}
                    </Link>
                    <span className="text-gray-400">{e.kind === 'completed' ? '完了' : '着手'}</span>
                  </li>
                ))}
                {events.length > 12 && (
                  <li className="text-[11px] text-gray-400 pl-22">ほか {events.length - 12} 件</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
    </div>
  )
}

