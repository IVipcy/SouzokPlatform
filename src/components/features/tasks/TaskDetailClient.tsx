'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Briefcase, Play, CheckCircle2, ExternalLink, ChevronDown, ChevronUp, Check, Package, PackageCheck, ArrowRightCircle, Landmark } from 'lucide-react'
import { resolveTaskLanding, taskLandingUrl } from '@/lib/taskLanding'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Section, InlineTextarea } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import CompleteTaskModal from './CompleteTaskModal'
import CompletionCautionModal from './CompletionCautionModal'
import TaskHourenSouModal from './TaskHourenSouModal'
import { getCompletionCaution, type CompletionCaution } from '@/lib/completionCaution'
import { getStartSignal, isWaitingReceipt, receiptWaitNote } from '@/lib/taskReadiness'
import { isFinanceFreezeTask } from '@/lib/financeFreeze'
import { getPhaseLabel } from '@/lib/phases'
import { TASK_STATUSES_V12, STATUS_FLOW_STEPS } from '@/lib/taskSectionDefs'
import TaskDetailSidebar from './TaskDetailSidebar'
import PrevTaskReviewSection from './PrevTaskReviewSection'
import TaskCreatedDocsSection from './TaskCreatedDocsSection'
import TaskTargetPicker, { TARGET_GYOMU, emptyTarget, resolveTargetRid, type TaskTarget } from './TaskTargetPicker'

import { useCurrentMember } from '@/lib/useCurrentMember'
import { useIsManager } from '@/components/providers/AuthProvider'
import type { TaskRow, MemberRow, CaseRow, CaseDocumentRow, CaseActivityRow, TaskDependencyRow, TaskTemplateRow, DocumentRow, HeirRow, RealEstatePropertyRow, ContractDocumentRow } from '@/types'
import { institutionGuide } from '@/lib/institutionAlert'

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
  { key: '超急ぎ', label: '超急ぎ' },
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
  const isManager = useIsManager()
  const [reverting, setReverting] = useState(false)
  const caseData = task.cases
  const clientData = caseData?.clients

  // システムタスクは前後関係を持たないので、関連セクションを非表示
  const isSystemTask = task.task_kind === 'system'

  // 前段タスク評価は一旦オフ（並列タスクが多く前段が不明瞭・タスク詳細を経由しない運用のため）。
  // データ(task_reviews)は残置し、将来「確認簿にW-Check相乗り評価」へ導線を付け替える想定。UIのみ非表示。
  const SHOW_PREV_TASK_REVIEW = false
  // 前段確認の表示判定（実体のある前段だけ）：①完了ゲートでこのタスクを着手OKにした
  // 元タスクがある、または ②同じ業務区分で完了したタスクがある
  const hasPrevContext = SHOW_PREV_TASK_REVIEW && !isSystemTask && (() => {
    const readyFrom = (task.ext_data as { ready_from_task_id?: string } | null)?.ready_from_task_id
    if (readyFrom && caseTasks.some(t => t.id === readyFrom && t.status === '完了')) return true
    return caseTasks.some(t => t.id !== task.id && t.status === '完了' && t.phase === task.phase)
  })()

  const currentStatus = normalizeStatus(task.status)

  // ─── 保存ヘルパー ───
  const saveField = async (field: string, value: unknown) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ [field]: value ?? null }).eq('id', task.id)
    router.refresh()
  }



  // このタスクの作業場所（戸籍請求タブ等）。実務タブで行うタスクだけ値が入る。
  // 導線カードの出し分けと、作成物セクションを出すかどうかの判断に使う。
  const landing = (!caseData || currentStatus === '完了' || isSystemTask) ? null : resolveTaskLanding(task)

  // ─── ステータス進行 ───
  const [advancing, setAdvancing] = useState(false)
  // 完了ゲート（実施結果＋次に着手OKにするタスク選択）
  const [completeOpen, setCompleteOpen] = useState(false)
  // 完了前の注意（依頼のし忘れ・凍結確認漏れ等）。ソフトなアナウンス、完了は止めない。
  const [caution, setCaution] = useState<CompletionCaution | null>(null)
  const [cautionBusy, setCautionBusy] = useState(false)
  const [checkingCaution, setCheckingCaution] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // 後から対象（実務タブの作業場所）を紐づけるときの入力中の値
  const [pendingTarget, setPendingTarget] = useState<TaskTarget>(emptyTarget)
  // このタスクについて送った相談（報連相）の状態。
  //   pending  … 回答待ち（タスクは確認中。完了させない）
  //   answered … 回答済み（完了できる）
  const [review, setReview] = useState<{ pending: number; answer: { by: string | null; date: string | null; comment: string | null } | null }>({ pending: 0, answer: null })
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

  // このタスクに紐づく相談の回答状況を読む。確認中の完了可否と、回答内容の表示に使う。
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await createClient()
        .from('case_reports')
        .select('status, confirmed_date, confirm_comment, confirmer:members!case_reports_confirmer_id_fkey(name)')
        .eq('task_id', task.id)
        .order('created_at', { ascending: false })
      if (!alive) return
      const rows = (data ?? []) as unknown as Array<{ status: string; confirmed_date: string | null; confirm_comment: string | null; confirmer: { name: string } | null }>
      const pending = rows.filter(r => r.status !== '確認済').length
      const ans = rows.find(r => r.status === '確認済')
      setReview({
        pending,
        answer: ans ? { by: ans.confirmer?.name ?? null, date: ans.confirmed_date, comment: ans.confirm_comment } : null,
      })
    })()
    return () => { alive = false }
  }, [task.id, task.status])

  const handleAdvance = useCallback(async () => {
    if (advancing) return
    // 確認中＝担当に相談を投げて回答待ち。回答が付くまでは完了させない。
    if (currentStatus === '確認中' && review.pending > 0) {
      showToast('相談への回答待ちです。回答が付くと完了できます', 'error')
      return
    }
    // 事務管理タスクの完了は完了ゲートを通す。ゲート前に「依頼のし忘れ等」の軽い注意を挟む（止めない）。
    if ((currentStatus === '対応中' || currentStatus === '確認中') && task.task_kind !== 'system') {
      setCheckingCaution(true)
      try {
        const c = await getCompletionCaution(task, currentMemberId ?? null)
        if (c) setCaution(c)
        else setCompleteOpen(true)
      } catch {
        setCompleteOpen(true)  // 判定失敗しても完了は妨げない
      } finally {
        setCheckingCaution(false)
      }
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
      } else if (currentStatus === '対応中' || currentStatus === '確認中') {
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
  }, [advancing, currentMemberId, currentStatus, task, router, financeFreezeBlocked, review.pending])

  // ステータスを1段戻す（押し間違いの訂正用）。対応中→着手前（着手記録も消す）／完了→対応中。
  // 差戻しワークフローではなく単なる訂正。本人または管理担当のみ。理由・通知なし。
  const canRevert = isManager || (!!task.started_by && task.started_by === currentMemberId)
  const handleRevert = useCallback(async () => {
    if (reverting) return
    const to = currentStatus === '完了' ? '対応中' : '着手前'
    if (!window.confirm(`このタスクを「${to}」に戻しますか？（押し間違いの訂正用）`)) return
    setReverting(true)
    try {
      const supabase = createClient()
      const updates: Record<string, unknown> = { status: to }
      if (to === '着手前') { updates.started_by = null; updates.started_at = null }
      if (to === '対応中') { updates.completed_at = null }
      const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
      if (error) { showToast(`エラー: ${error.message}`, 'error'); return }
      showToast(`「${to}」に戻しました`)
      router.refresh()
    } catch {
      showToast('通信エラーが発生しました', 'error')
    } finally {
      setReverting(false)
    }
  }, [reverting, currentStatus, task, router])

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
              {/* 区分バッジ + Phase + Category（内部IDは非表示） */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
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

              {/* タスク名。「タスク名:」のラベルは外した。
                  太字の見出しがそれと分かるので、ラベルは1行ぶんの高さを取っていただけだった。
                  優先度は下の帯で変えるが、急ぎ・超急ぎだけは開いた瞬間に気づけるようここにも出す。 */}
              <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                <h1 className="text-[22px] font-extrabold text-brand-900 tracking-tight">
                  {task.title}
                </h1>
                {(task.priority === '急ぎ' || task.priority === '超急ぎ') && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11.5px] font-bold border flex-shrink-0 ${
                    task.priority === '超急ぎ' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-amber-50 text-amber-700 border-amber-300'}`}>
                    {task.priority}
                  </span>
                )}
              </div>

              {/* 案件と手続き区分は1行にまとめる。案件アイコン付きのリンクと、区切りのあとの区分で
                  何を指しているかは読み取れるので、ラベルは置かない。 */}
              {caseData && (
                <div className="flex items-baseline gap-2 flex-wrap text-[13px]">
                  <Link
                    href={`/cases/${caseData.id}`}
                    className="text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1.5"
                  >
                    <Briefcase className="w-3.5 h-3.5" strokeWidth={2} />
                    {clientData?.name ?? caseData.deal_name} ({caseData.case_number})
                  </Link>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-700">
                    {caseData.procedure_type && caseData.procedure_type.length > 0
                      ? caseData.procedure_type.join('・')
                      : <span className="text-gray-400 italic">手続き区分 未設定</span>}
                  </span>
                </div>
              )}
            </div>

            {/* 相談の状況（担当に確認する を使ったタスクだけ） */}
            {(review.pending > 0 || review.answer) && (
              <div className={`mt-2 rounded-lg border px-3 py-2 text-[12.5px] ${review.pending > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                {review.pending > 0 ? (
                  <span>担当へ確認中です。回答が付くと完了できます（報連相タブで確認できます）。</span>
                ) : (
                  <span>
                    回答済み{review.answer?.by ? `：${review.answer.by}` : ''}{review.answer?.date ? `（${review.answer.date}）` : ''}
                    {review.answer?.comment ? ` 「${review.answer.comment}」` : ''}
                  </span>
                )}
              </div>
            )}

            {/* ステータス表示 + 進行ボタン + 優先度 */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {/* 進行ボタン */}
              {currentStatus === '着手前' && (
                <div className="inline-flex items-center gap-2">
                  {!canStart && <span className="text-[12px] text-gray-400">口座の凍結確認後に押せます</span>}
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
                </div>
              )}
              {currentStatus === '対応中' && (
                <div className="inline-flex items-center gap-2">
                  {canRevert && <button type="button" onClick={handleRevert} disabled={reverting} className="text-[11px] text-gray-400 hover:text-gray-600 underline underline-offset-2 disabled:opacity-50" title="押し間違いの訂正">着手前に戻す</button>}
                  <button
                    onClick={handleAdvance}
                    disabled={advancing || checkingCaution}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all
                      ${advancing || checkingCaution ? 'bg-brand-400 cursor-wait scale-95' : 'bg-brand-600 hover:bg-brand-700 hover:scale-105 active:scale-95'}`}
                  >
                    {advancing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />}
                    {advancing ? '処理中...' : '完了にする'}
                  </button>
                </div>
              )}
              {currentStatus === '確認中' && (
                <div className="inline-flex items-center gap-2 flex-wrap">
                  {canRevert && <button type="button" onClick={handleRevert} disabled={reverting} className="text-[11px] text-gray-400 hover:text-gray-600 underline underline-offset-2 disabled:opacity-50" title="押し間違いの訂正">着手前に戻す</button>}
                  <button
                    onClick={handleAdvance}
                    disabled={advancing || checkingCaution || review.pending > 0}
                    title={review.pending > 0 ? '相談への回答待ちです' : undefined}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all
                      ${review.pending > 0 ? 'bg-gray-300 cursor-not-allowed' : advancing || checkingCaution ? 'bg-brand-400 cursor-wait scale-95' : 'bg-brand-600 hover:bg-brand-700 hover:scale-105 active:scale-95'}`}
                  >
                    {advancing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />}
                    {advancing ? '処理中...' : '完了にする'}
                  </button>
                </div>
              )}
              {currentStatus === '完了' && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold text-green-700 bg-green-50 border border-green-200">
                    <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
                    完了
                  </span>
                  {canRevert && <button type="button" onClick={handleRevert} disabled={reverting} className="text-[11px] text-gray-400 hover:text-gray-600 underline underline-offset-2 disabled:opacity-50" title="押し間違いの訂正">対応中に戻す</button>}
                </div>
              )}
              {/* タスクの進め方の相談。中身は報連相だが、押す人にとっては
                  「担当に確認する」という行為なのでその名前にする。
                  送るとこのタスクは「確認中」になり、回答が付くまで完了できない。
                  回答待ちの間は押させない。重ねて送ると同じ件で報連相が二重に立ち、
                  どちらに答えれば完了できるのか分からなくなるため。 */}
              {!isSystemTask && (
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  disabled={review.pending > 0}
                  title={review.pending > 0
                    ? '担当の回答待ちです。回答が付いてから、必要なら改めて確認できます'
                    : 'タスクの進め方を担当に相談します。送るとこのタスクは「確認中」になり、回答が付くまで完了できません'}
                  // 「完了にする」の隣に並ぶ従のボタン。主と高さ・文字サイズを揃え、
                  // 塗りを外して差を付ける。
                  // 前は 12px・px-3 py-1.5 の琥珀の塗りで、主より一回り小さく色だけ強く、
                  // 並べたときに背の高さが揃わないまま2つの色が競っていた。
                  // 琥珀はこの画面では「進行中・注意」の色なので、確認を出す操作には使わない。
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    review.pending > 0
                      ? 'text-gray-300 bg-white border-gray-200 cursor-not-allowed'
                      : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50 hover:text-gray-800'}`}
                >
                  担当に確認する
                </button>
              )}

              {/* ステータスのバッジは置かない。押せない飾りで、状態は左の帯と下の矢羽根で分かる。
                  優先度も左の情報欄へ移した（急ぎのときだけタスク名の横に赤バッジを出す）。 */}
            </div>
          </div>
        </div>

        {/* 周辺情報の帯。矢羽根＋期限・優先度・外出・起票を横1本に並べる。
            前は左に150pxの縦1列（1項目＝ラベルと値の2行）を積み、その右の広い場所に
            点3つの矢羽根を置いていたので、点のために横幅の6割を使い、
            本題の「このタスクの作業内容」が画面の下半分に追いやられていた。
            矢羽根は消さずに小さくする（前後の状態と「着手前に戻せる」ことが図で読めるため）。
            作業完了日は矢羽根の「完了」に日付が出るので置かない。 */}
        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 flex items-center gap-x-4 gap-y-2 flex-wrap">
          {/* 矢羽根（横に寝かせた小さい版）。今どこかは文字でも添える */}
          <div className="flex items-center gap-1.5 flex-none">
            {STATUS_FLOW_STEPS.map((step, i) => {
              const isPassed = currentFlowIdx >= 0 && i < currentFlowIdx
              const isActive = step === currentStatus
              const isLast = i === STATUS_FLOW_STEPS.length - 1
              const def = TASK_STATUSES_V12.find(s => s.key === step)
              return (
                <div key={step} className="flex items-center gap-1.5" title={step}>
                  <span className={`rounded-full block ${isActive ? 'w-2.5 h-2.5 shadow-[0_0_0_3px_rgba(37,99,235,0.2)]' : 'w-2 h-2'}`}
                    style={{ backgroundColor: isActive ? (def?.color ?? '#2563EB') : isPassed ? '#059669' : '#CBD5E1', opacity: isPassed && !isActive ? 0.6 : 1 }} />
                  {!isLast && <span className="block w-5 h-px" style={{ backgroundColor: isPassed ? '#059669' : '#CBD5E1', opacity: isPassed ? 0.5 : 1 }} />}
                </div>
              )
            })}
            <span className="ml-1 text-[12px] font-semibold text-brand-700">{currentStatus}</span>
          </div>
          <span className="w-px h-6 bg-gray-200 flex-none" />
          <label className="flex items-center gap-1.5 flex-none">
            <span className="text-[10px] text-gray-400">期限</span>
            <input type="date" defaultValue={task.due_date ?? ''} key={`due-${task.due_date ?? ''}`} onBlur={e => { if (e.target.value !== (task.due_date ?? '')) saveField('due_date', e.target.value || null) }} className="text-[12px] font-medium text-gray-800 border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-brand-500 bg-white" />
          </label>
          <label className="flex items-center gap-1.5 flex-none">
            <span className="text-[10px] text-gray-400">優先度</span>
            <select
              value={task.priority}
              onChange={e => saveField('priority', e.target.value)}
              style={{ fontFamily: 'inherit' }}
              className={`text-[12px] font-semibold rounded border px-1.5 py-0.5 outline-none cursor-pointer ${task.priority === '超急ぎ' ? 'bg-red-50 text-red-700 border-red-300' : task.priority === '急ぎ' ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-white text-gray-700 border-gray-200'}`}
            >
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.key}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-700 cursor-pointer flex-none">
            <input
              type="checkbox"
              checked={((task.ext_data ?? {}) as Record<string, unknown>).outing === true}
              onChange={e => saveField('ext_data', { ...((task.ext_data ?? {}) as Record<string, unknown>), outing: e.target.checked })}
              className="w-4 h-4 accent-brand-600"
            />
            外出タスク
          </label>
          <span className="w-px h-6 bg-gray-200 flex-none" />
          <span className="text-[11.5px] text-gray-500 flex-none">
            起票 <span className="font-mono text-gray-700">{(task.issued_date ?? task.created_at)?.slice(0, 10) ?? '—'}</span>
            <span className="ml-1.5 text-gray-600">
              {allMembers.find(m => m.id === task.created_by)?.name ?? task.created_by_member?.name ?? <span className="text-gray-300">—</span>}
            </span>
          </span>
          {/* 対象（実務タブのどこの作業か）。未設定のときだけ出す。
              一括生成をやめた運用で、先にタスクだけ立てて後から役所・銀行が決まる流れを通すため。
              すでに紐づいているタスクは、付け替えると導線がずれるのでここでは触らせない。 */}
          {!task.source_rid && !isSystemTask && TARGET_GYOMU.includes((task.phase ?? '') as typeof TARGET_GYOMU[number]) && (
            <>
              <span className="w-px h-6 bg-gray-200 flex-none" />
              <span className="flex items-center gap-1.5 min-w-[220px]">
                <span className="text-[10px] text-gray-400 flex-none">対象</span>
                <TaskTargetPicker
                  caseId={task.case_id}
                  gyomu={task.phase ?? ''}
                  value={pendingTarget}
                  onChange={async v => {
                    setPendingTarget(v)
                    const rid = await resolveTargetRid(task.case_id, v)
                    if (rid) { await saveField('source_rid', rid); setPendingTarget(emptyTarget()) }
                  }}
                  compact
                />
              </span>
            </>
          )}
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

          {/* 基本情報は廃止（期限・起票日・作業完了日・優先度はヘッダーに集約）。案件サマリー・着手者履歴は右サイドのアコーディオンへ移動。 */}

          {/* 作業内容・実施結果 */}
          {SHOW_WORK_CONTENT && (
            <TaskWorkSection
              task={task}
              saveField={saveField}
            />
          )}

          {/* 金融機関の相続手続きの案内。作業するときに手元にあると助かるものだけ出す。
              マスタ（18行）に載っている機関のときだけ。載っていなければ何も出さない。 */}
          {(() => {
            const bank = (task.source_rid ?? '').match(/^(?:fin|cancel):(.+)$/)?.[1]
            const guide = institutionGuide(task.phase, bank)
            if (!guide) return null
            return (
              <div className="rounded-xl border border-brand-200 bg-brand-50/60 overflow-hidden">
                <div className="px-4 py-2 border-b border-brand-200 flex items-center gap-2 flex-wrap">
                  <Landmark className="w-4 h-4 text-brand-600" strokeWidth={2} />
                  <span className="text-[13px] font-bold text-brand-800">{guide.inst.name}の相続手続き</span>
                  <span className="text-[10.5px] text-brand-600/80">情報の確かさ：{guide.inst.confidence}</span>
                  <a href={guide.inst.sourceUrl.split(' ')[0]} target="_blank" rel="noreferrer"
                    className="ml-auto text-[11px] text-brand-700 underline hover:text-brand-900">公式ページ</a>
                </div>
                <div className="px-4 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1">
                  {guide.items.map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[12px] leading-relaxed">
                      <span className="text-brand-700/70 w-28 flex-none">{k}</span>
                      <span className="text-gray-700 min-w-0">{v || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* 実務タブへの導線。作業内容を読み終えた位置に置き、そのまま次の一手へ行けるようにする
              （以前はヘッダー直下の細いバーで、読み終えた目線から遠かった）。 */}
          {landing && caseData && (
            <div className="flex items-center gap-3.5 rounded-xl border-2 border-brand-300 bg-brand-50 px-4 py-4">
              <span className="flex-none w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center">
                <ArrowRightCircle className="w-5 h-5" strokeWidth={2.25} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-brand-800">この作業は「{landing.label}」タブで行います</div>
                <div className="text-[12px] text-brand-700/80 leading-relaxed">
                  該当の行が開いた状態で移動します。そこで入力すると、このタスクはその場で完了します。
                </div>
              </div>
              <Link
                href={taskLandingUrl(caseData.id, task.id, landing)}
                className="flex-none inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[13.5px] font-bold text-white bg-brand-600 hover:bg-brand-700 shadow-sm"
              >
                <ExternalLink className="w-4 h-4" strokeWidth={2.25} />{landing.label}タブを開く
              </Link>
            </div>
          )}

          {/* 作成物（documents テーブル）。
              実務タブで作業するタスクでは、AI書類作成もアップロードも向こうで行うので出さない。 */}
          {!landing && (
            <TaskCreatedDocsSection
              task={task}
              caseData={(task as unknown as { cases?: CaseRow }).cases as CaseRow}
              documents={createdDocuments}
              tasks={caseTasks}
              heirs={heirs}
              properties={properties}
              contractDocuments={contractDocuments}
            />
          )}
        </div>

        {/* 右カラム — 案件サマリー・着手者履歴（アコーディオン）＋関連ドキュメント */}
        <aside className="w-full lg:w-[320px] lg:flex-shrink-0">
          <div className="lg:sticky lg:top-[90px] flex flex-col gap-3">
            {caseData && (
              <AccordionPanel title="案件サマリー" defaultOpen>
                <CaseSummaryPanel bare taskPhase={task.phase} caseTasks={caseTasks} currentTaskId={task.id} />
              </AccordionPanel>
            )}

            <AccordionPanel title="着手者・作業履歴">
              {/* 着手者表示 */}
              <div className="mb-3">
                {startedMember ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[13px] font-bold" style={{ backgroundColor: startedMember.avatar_color }}>{startedMember.name[0]}</div>
                    <div>
                      <span className="text-sm font-semibold text-gray-800">{startedMember.name}</span>
                      <span className="text-[12px] text-gray-500 ml-2">{task.started_at ? `${new Date(task.started_at).toLocaleDateString('ja-JP')} 着手` : '着手中'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-500">まだ誰も着手していません</span>
                    {currentStatus === '着手前' && (
                      <button onClick={handleAdvance} className="ml-auto text-xs font-bold text-green-700 bg-green-100 hover:bg-green-200 border border-green-300 px-3 py-1 rounded-lg transition-colors">▶ 着手する</button>
                    )}
                  </div>
                )}
              </div>
              {activities.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-2">作業履歴</div>
                  <div className="space-y-1.5">
                    {activities.map(act => (
                      <div key={act.id} className="flex items-start gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${act.activity_type === 'task_started' ? 'bg-green-500' : act.activity_type === 'task_completed' ? 'bg-brand-500' : act.activity_type === 'status_change' ? 'bg-amber-500' : 'bg-gray-400'}`} />
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
            </AccordionPanel>

            <TaskDetailSidebar
              task={task}
              documents={documents}
              dependencies={dependencies}
              caseTasks={caseTasks}
              taskTemplates={taskTemplates}
            />
          </div>
        </aside>
      </div>

      {/* 完了前の注意（実務タブでの依頼のし忘れ・凍結確認漏れ等）。止めない・軽い促し。 */}
      {caution && (
        <CompletionCautionModal
          caution={caution}
          busy={cautionBusy}
          onRequest={async () => {
            if (!caution) return
            setCautionBusy(true)
            try { await caution.request() } catch { /* 依頼失敗でも完了は進める */ }
            setCautionBusy(false)
            setCaution(null)
            setCompleteOpen(true)
            router.refresh()
          }}
          onProceed={() => { setCaution(null); setCompleteOpen(true) }}
          onClose={() => setCaution(null)}
        />
      )}

      {/* 完了ゲート（実施結果＋次に着手OKにするタスク選択） */}
      {completeOpen && (
        <CompleteTaskModal
          task={task}
          onClose={() => setCompleteOpen(false)}
          onCompleted={() => { setCompleteOpen(false); router.refresh() }}
        />
      )}

      {/* 作業中の相談は報連相で送る（ヘルプタスクの起票はやめた） */}
      {helpOpen && (
        <TaskHourenSouModal
          isOpen
          onClose={() => setHelpOpen(false)}
          caseId={task.case_id}
          currentMemberId={currentMemberId}
          taskId={task.id}
          taskTitle={task.title}
          onSent={async () => {
            setHelpOpen(false)
            // 相談を送ったタスクは回答が付くまで「確認中」で止める（完了ボタンは押せない）。
            // 完了・着手前のタスクからは送れないので、対応中・着手前のときだけ移す。
            if (currentStatus !== '完了') {
              await createClient().from('tasks').update({ status: '確認中' }).eq('id', task.id)
            }
            router.refresh()
          }}
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
                {/* 理由は運用変更で全タスク共通の「着手OK」になったため、そのまま出すと
                    「着手OK：着手OK。」と重なる。中身のある理由のときだけ添える。 */}
                <span>着手すると「対応中」になります。{startSignal.reason && startSignal.reason !== '着手OK' ? `（${startSignal.reason}）` : ''}</span>
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
// ※実施結果は完了モーダルで書く。この画面には置かない（二重の入力口になるため）
function TaskWorkSection({
  task,
  saveField,
}: {
  task: TaskRow
  saveField: (field: string, value: unknown) => Promise<void>
  onRefresh?: () => void
}) {
  return (
    <div className="space-y-3">
      {/* このタスクの作業内容（見出しと重複するラベルは非表示、補足は?ホバー） */}
      <Section title="このタスクの作業内容" hint="このタスクの作業内容・備考を自由に記入してください。完了時に次の担当へ引き継がれます。">
        <InlineTextarea
          label="作業内容"
          hideLabel
          value={task.procedure_text ?? ''}
          onSave={v => saveField('procedure_text', v)}
          placeholder="このタスクの作業内容・備考を記入…"
        />
      </Section>

    </div>
  )
}

// 右サイドの開閉パネル（アコーディオン）。
function AccordionPanel({ title, defaultOpen = false, children }: { title: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors">
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  )
}

// タスク詳細の「案件サマリー」パネル。
// このタスクが属する業務（gyomu）の「これまでの作業」＝完了タスクとその実施結果だけを出す。
// 進行中・残作業と、案件全体の直近の動きは廃止。これから何をやるかはタスク一覧と
// 案件詳細の実務タブで見るもので、ここに並べても同じ情報が3か所に散るだけだった。
// bare=true のときは外側の Section 見出しを付けず、アコーディオンの中身として描画する。
function CaseSummaryPanel({ taskPhase, caseTasks, currentTaskId, bare = false }: {
  taskPhase: string | null
  caseTasks: TaskRow[]
  /** 今開いているタスク。一覧から自分自身を除外するため。 */
  currentTaskId: string
  bare?: boolean
}) {
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

  // 事務管理タスク（task_kind='case'）かつ同じ業務区分のもの。進捗カウントには現タスクも含める。
  const gyomuTasks = caseTasks
    .filter(t => t.task_kind !== 'system' && currentGyomu && stripPhasePrefix(t.phase ?? '') === currentGyomu)

  // 一覧表示は「今開いているタスク」を除外（自分自身は出さない）
  const otherTasks = gyomuTasks.filter(t => t.id !== currentTaskId)
  const doneTasks = otherTasks
    .filter(t => normalize(t.status) === '完了')
    .sort((a, b) => (b.completed_at ?? b.updated_at ?? '').localeCompare(a.completed_at ?? a.updated_at ?? ''))

  const body = (
    <>
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

          {otherTasks.length === 0 && (
            <div className="text-[12px] text-gray-400">この業務には、今開いているタスク以外のタスクはありません</div>
          )}
        </div>
      ) : (
        <div className="text-[12px] text-gray-400">業務が紐づいていません（システムタスク等）</div>
      )}

    </>
  )
  return bare ? body : (<div><Section title="案件サマリー">{body}</Section></div>)
}

