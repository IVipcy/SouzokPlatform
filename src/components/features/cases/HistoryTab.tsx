'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { StickyNote, ExternalLink, CheckCircle2 as CheckIcon, Send, Check, ListPlus, MessageSquare, Plus } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'
import { Section } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import { koteiOf, koteiRank, koteiLabel, KOTEI_ORDER, KOTEI_GYOMU, KOTEI_COLOR } from '@/lib/kotei'
import HourenSouModal from './HourenSouModal'
import AddTaskModal from './AddTaskModal'
import type { CaseRow, CaseActivityRow, MemberRow, ProgressReportRow, ProgressReportKind, CaseReportRow } from '@/types'
import { checkCaseCompletable, type MissingInvoice, type PendingRefund, type MissingReferral } from '@/lib/caseCompletionGate'
import { useRouter } from 'next/navigation'

// 案件報告の分類ラベル。ステータス絞り込みなし・常時4種類全部から選択可能。
const KIND_LABEL: Record<ProgressReportKind, string> = {
  progress_check: '案件報告',
  work_complete: '業務完了申請',
  case_reopen: '案件再オープン',
  delivery_confirm: '納品確認申請',
}
const KIND_CHIP: Record<ProgressReportKind, string> = {
  progress_check: 'bg-sky-100 text-sky-700 border-sky-200',
  work_complete: 'bg-amber-100 text-amber-800 border-amber-300',
  case_reopen: 'bg-purple-100 text-purple-700 border-purple-300',
  delivery_confirm: 'bg-emerald-100 text-emerald-700 border-emerald-300',
}
const KIND_PLACEHOLDER: Record<ProgressReportKind, string> = {
  progress_check: '例：相続人の確定内容を一緒に確認してほしい',
  work_complete: '例：全請求発行済・追加補足あればどうぞ',
  case_reopen: '例：追加戸籍が発生。追加請求＋登記対応が必要',
  delivery_confirm: '例：納品書類の対象／対象外を確認してほしい',
}

// 進捗メモの業務区分（保存値 or タスクのphaseで補完。"PhaseN:"接頭辞除去）
const noteGyomu = (n: CaseActivityRow): string => (n.gyomu ?? n.tasks?.phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()
// 進捗メモの工程（業務区分から導出）
const noteKotei = (n: CaseActivityRow): string => { const g = noteGyomu(n); return g ? koteiOf(g) : '' }

type Props = {
  caseData: CaseRow
  allMembers: MemberRow[]
  currentMemberId: string | null
  /** 確認者＝この案件の受注担当（依頼先に固定）。 */
  salesMemberId?: string | null
  /** 案件報告を依頼できるか（この案件の管理担当のときのみ true）。 */
  canRequestReview?: boolean
  /** メモのタスクリンクで「完了」判定するために渡す（任意） */
  tasks?: { id: string; status: string }[]
  /** 表示セクション。'report'=案件報告(依頼履歴)のみ／'memo'=報連相・メモのみ／未指定=両方 */
  section?: 'report' | 'memo'
  /** 通知から遷移した時に自動オープンする案件報告/報連相のID */
  openReportId?: string | null
}

/**
 * 進捗報告・メモ（案件進捗タブの子タブ）。
 * 進捗報告と進捗メモを縦に並べて両方表示する（旧・内部タブ分けは解消）。
 * 進捗確認の依頼は「この案件の管理担当」だけが、確認者＝受注担当に対して出せる。
 */
export default function HistoryTab({ caseData, allMembers, currentMemberId: serverMemberId, salesMemberId, canRequestReview = false, tasks = [], section, openReportId }: Props) {
  const taskStatusMap = new Map(tasks.map(t => [t.id, t.status]))
  const currentMemberId = useCurrentMember(serverMemberId)
  const [newNote, setNewNote] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newKotei, setNewKotei] = useState('')
  const [newGyomu, setNewGyomu] = useState('')
  const [koteiFilter, setKoteiFilter] = useState('')
  const [gyomuFilter, setGyomuFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [activities, setActivities] = useState<CaseActivityRow[]>([])
  const [progressReports, setProgressReports] = useState<ProgressReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [reviewPointInput, setReviewPointInput] = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  // 統一報告モーダル: 分類選択。デフォルトは既存の週次案件報告。
  const [reportKind, setReportKind] = useState<ProgressReportKind>('progress_check')
  // 業務完了申請時のゲート未達ポップアップ内容
  const [completionBlocked, setCompletionBlocked] = useState<{ missing: MissingInvoice[]; pendingRefunds: PendingRefund[]; missingReferrals: MissingReferral[]; billingPattern: string; hasInvoices: boolean } | null>(null)
  const router = useRouter()
  const [confirmTarget, setConfirmTarget] = useState<ProgressReportRow | null>(null)
  const [confirmComment, setConfirmComment] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)
  // 「確認してタスク化」時にどの案件報告を対象にするかを保持（AddTaskModal 保存後に確認済にセット）
  const [taskModalPr, setTaskModalPr] = useState<ProgressReportRow | null>(null)
  // 報連相（case_reports）と、右上ボタンのモーダル制御
  const [caseReports, setCaseReports] = useState<CaseReportRow[]>([])
  const [houRenSouOpen, setHouRenSouOpen] = useState(false)
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  // 報連相の確認モーダル
  const [confirmReport, setConfirmReport] = useState<CaseReportRow | null>(null)
  const [confirmReportComment, setConfirmReportComment] = useState('')
  const [confirmReportSaving, setConfirmReportSaving] = useState(false)

  const memberName = (id: string | null) => (id ? allMembers.find(m => m.id === id)?.name ?? '—' : '—')

  const fetchActivities = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('case_activities')
      .select('*, members(*), tasks(id, title, phase)')
      .eq('case_id', caseData.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setActivities((data ?? []) as CaseActivityRow[])
    try {
      const { data: prData } = await supabase
        .from('progress_reports')
        .select('*')
        .eq('case_id', caseData.id)
        .order('requested_date', { ascending: false })
      setProgressReports((prData ?? []) as ProgressReportRow[])
    } catch { /* migration 未適用環境では空扱い */ }
    try {
      const { data: crData } = await supabase
        .from('case_reports')
        .select('*')
        .eq('case_id', caseData.id)
        .order('requested_date', { ascending: false })
      setCaseReports((crData ?? []) as CaseReportRow[])
    } catch { /* migration 196 未適用環境では空扱い */ }
    setLoading(false)
  }

  // 案件IDが変わったらサーバーから再取得（マウント時フェッチ）
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchActivities() }, [caseData.id])

  const handleAddNote = async () => {
    if (!newNote.trim() || !currentMemberId) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('case_activities').insert({
      case_id: caseData.id,
      member_id: currentMemberId,
      activity_type: 'note',
      title: newTitle.trim() || null,
      description: newNote.trim(),
      gyomu: newGyomu || null,
      activity_date: new Date().toISOString().split('T')[0],
    })
    setNewNote('')
    setNewTitle('')
    setNewKotei('')
    setNewGyomu('')
    setSaving(false)
    fetchActivities()
  }

  // 分類を選んだ瞬間のゲート判定 (業務完了申請のみ)。未達ならモーダルを閉じてポップアップで案内。
  const handleKindChange = async (next: ProgressReportKind) => {
    setReportKind(next)
    if (next === 'work_complete') {
      const supabase = createClient()
      const result = await checkCaseCompletable(supabase, caseData.id, caseData.billing_pattern)
      if (!result.ok) {
        // モーダル閉じて未完項目ポップアップを表示
        setRequestOpen(false)
        setCompletionBlocked({
          missing: result.missing,
          pendingRefunds: result.pendingRefunds,
          missingReferrals: result.missingReferrals,
          billingPattern: result.billingPattern,
          hasInvoices: result.hasInvoices,
        })
      }
    }
    // TODO(Phase3): delivery_confirm 時に納品対象書類ゼロなら弾く
  }

  // 統一報告モーダルの送信。分類 (progress_reports.kind) に応じて追加処理を分岐。
  const handleRequestReview = async () => {
    if (!canRequestReview) { showToast('案件報告は管理担当のみ可能です', 'error'); return }
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    setRequesting(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('progress_reports').insert({
      case_id: caseData.id,
      requester_id: currentMemberId,
      confirmer_id: null,
      status: '依頼中',
      requested_date: today,
      review_point: reviewPointInput.trim() || null,
      kind: reportKind,
    })
    if (error) { setRequesting(false); showToast('報告に失敗しました', 'error'); return }

    // 分類に応じた status 更新（承認前の状態遷移）
    //   work_complete → 案件を「業務完了申請中」へ (承認で完了になる)
    //   case_reopen   → 案件を「対応中(=案件進行中)」に戻す
    //   他は status 変更なし
    if (reportKind === 'work_complete') {
      await supabase.from('cases').update({ status: '業務完了申請中' }).eq('id', caseData.id)
    } else if (reportKind === 'case_reopen') {
      await supabase.from('cases').update({ status: '対応中' }).eq('id', caseData.id)
    } else if (reportKind === 'delivery_confirm') {
      // 納品確認申請 → 案件レベルの納品ステータスを「確認申請中」にする
      await supabase.from('cases').update({ delivery_status: '確認申請中' }).eq('id', caseData.id)
    }

    // 受注担当への通知。salesMemberId が無ければ通知はスキップ。
    if (salesMemberId) {
      const kindLabel = KIND_LABEL[reportKind]
      await supabase.from('notifications').insert({
        member_id: salesMemberId,
        type: 'progress_review_requested',
        case_id: caseData.id,
        title: `${kindLabel}が届きました`,
        body: `${caseData.case_number} ${caseData.deal_name}：${reviewPointInput.trim() || kindLabel + 'をお願いします'}`,
      })
    }
    setRequesting(false)
    setReviewPointInput('')
    setReportKind('progress_check')
    setRequestOpen(false)
    showToast(`${KIND_LABEL[reportKind]}を送信しました`, 'success')
    fetchActivities()
    router.refresh()
  }

  // 確認/承認/差戻し 処理。案件報告(progress_check)・案件再オープン は 確認する のみ。
  // 業務完了申請 は 承認 or 差戻し。承認で cases.status='完了'、差戻しで cases.status='対応中'。
  const handleConfirm = async (pr: ProgressReportRow, action: 'confirm' | 'reject' = 'confirm') => {
    if (!currentMemberId) return
    if (pr.requester_id === currentMemberId) { showToast('報告した本人は確認できません', 'error'); return }
    setConfirmSaving(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const kind = (pr.kind ?? 'progress_check') as ProgressReportKind
    // 差戻しの場合は confirm_comment 先頭に [差戻し] を付ける（DBスキーマは無変更で運用対応）
    const commentPrefix = action === 'reject' ? '[差戻し] ' : ''
    const { error } = await supabase.from('progress_reports')
      .update({ status: '確認済', confirmed_date: today, confirmer_id: currentMemberId, confirm_comment: (commentPrefix + confirmComment.trim()) || null })
      .eq('id', pr.id)
    setConfirmSaving(false)
    if (error) { showToast('確認に失敗しました', 'error'); return }

    // 分類 + アクションに応じた cases.status の更新
    //   work_complete + confirm → 完了 (業務完了)
    //   work_complete + reject  → 対応中 (差戻し)
    //   他は変更なし
    if (kind === 'work_complete') {
      const nextStatus = action === 'confirm' ? '完了' : '対応中'
      await supabase.from('cases').update({ status: nextStatus }).eq('id', caseData.id)
    } else if (kind === 'delivery_confirm') {
      // 承認 → 納品待ち / 差戻し → 準備中 に戻す
      const nextDelivery = action === 'confirm' ? '納品待ち' : '準備中'
      await supabase.from('cases').update({ delivery_status: nextDelivery }).eq('id', caseData.id)
    }

    const titleByKind: Record<ProgressReportKind, string> = {
      progress_check: '案件報告の確認が完了しました',
      work_complete: action === 'confirm' ? '業務完了が承認されました' : '業務完了申請が差し戻されました',
      case_reopen: '案件再オープンが確認されました',
      delivery_confirm: action === 'confirm' ? '納品確認が承認されました' : '納品確認申請が差し戻されました',
    }
    await supabase.from('notifications').insert({
      member_id: pr.requester_id,
      type: 'progress_review_confirmed',
      case_id: caseData.id,
      title: titleByKind[kind],
      body: `${caseData.case_number} ${caseData.deal_name} を ${memberName(currentMemberId)} さんが対応しました`,
    })
    setConfirmTarget(null); setConfirmComment('')
    showToast(action === 'reject' ? '差戻しました' : '確認済にしました', 'success')
    fetchActivities()
    router.refresh()
  }

  // 報連相の確認：確認者＝自分で確定し、依頼者へ通知
  const handleConfirmReport = async (cr: CaseReportRow) => {
    if (!currentMemberId) return
    setConfirmReportSaving(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('case_reports')
      .update({ status: '確認済', confirmed_date: today, confirmer_id: currentMemberId, confirm_comment: confirmReportComment.trim() || null })
      .eq('id', cr.id)
    setConfirmReportSaving(false)
    if (error) { showToast('確認に失敗しました', 'error'); return }
    if (cr.requester_id) {
      await supabase.from('notifications').insert({
        member_id: cr.requester_id,
        type: 'case_report_confirmed',
        case_id: caseData.id,
        title: `${cr.kind}が確認されました`,
        body: `${caseData.case_number} ${caseData.deal_name}：${memberName(currentMemberId)} さんが確認しました`,
      })
    }
    setConfirmReport(null); setConfirmReportComment('')
    showToast('確認済にしました', 'success')
    fetchActivities()
  }

  // 通知から遷移した時：該当ID(progress_reports/case_reports)の確認モーダルを自動オープン
  useEffect(() => {
    if (!openReportId) return
    const pr = progressReports.find(r => r.id === openReportId)
    if (pr) { setConfirmTarget(pr); setConfirmComment(''); return }
    const cr = caseReports.find(r => r.id === openReportId)
    if (cr) { setConfirmReport(cr); setConfirmReportComment('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReportId, progressReports, caseReports])

  // 「確認してタスク化」→ 確認モーダルを閉じ AddTaskModal を開く（対象progress_reportは taskModalPr で保持）
  const openTaskModal = (pr: ProgressReportRow) => {
    setTaskModalPr(pr)
    setConfirmTarget(null)   // 確認モーダルは閉じる（confirmComment は保持してタスク作成後に確認済へ反映）
  }

  // AddTaskModal 保存後の後処理：対象progress_reportを確認済にセット
  const finalizeTaskizeFlow = async () => {
    const pr = taskModalPr
    if (!pr || !currentMemberId) { setTaskModalPr(null); return }
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('progress_reports')
      .update({ status: '確認済', confirmed_date: today, confirmer_id: currentMemberId, confirm_comment: confirmComment.trim() || null })
      .eq('id', pr.id)
    setTaskModalPr(null); setConfirmComment('')
    showToast('タスクを作成し、案件報告を確認済にしました', 'success')
    fetchActivities()
  }

  // メモ一覧（活動履歴のうち手入力メモのみ。タスク着手/完了・ステータス変更は
  // タイムラインに統合したため、ここでは表示しない）
  const notes = activities
    .filter(a => a.activity_type === 'note')
    .filter(a => !koteiFilter || noteKotei(a) === koteiFilter)
    .filter(a => !gyomuFilter || noteGyomu(a) === gyomuFilter)
    .sort((a, b) => b.activity_date.localeCompare(a.activity_date))

  // フィルタ用の工程・業務区分候補（メモに存在するもの＋正準順）
  const allNotes = activities.filter(a => a.activity_type === 'note')
  const noteKoteiOptions = [...new Set(allNotes.map(noteKotei).filter(Boolean))].sort((a, b) => koteiRank(a) - koteiRank(b))
  const noteGyomuOptions = (() => {
    const present = new Set(allNotes.map(noteGyomu).filter(Boolean))
    return [...GYOMU_ALL.filter(g => present.has(g)), ...[...present].filter(g => !GYOMU_ALL.includes(g))]
  })()

  return (
    <div className="space-y-3.5">
      {/* 案件報告 */}
      {section !== 'memo' && (
      <Section title="案件報告">
        <div className="flex flex-wrap justify-end gap-2 mb-2.5">
          {canRequestReview && (
            <Button variant="secondary" size="sm" leftIcon={<Send className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => { setReviewPointInput(''); setReportKind('progress_check'); setRequestOpen(true) }}>
              報告する
            </Button>
          )}
          <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => setHouRenSouOpen(true)}>
            報連相
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />} onClick={() => setAddTaskOpen(true)}>
            タスク化
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 mb-2.5">「案件報告」→相手の席で一緒に確認→<span className="font-medium text-gray-500">確認した本人が自分のPCで「確認した」</span>を押します（報告した本人は押せません）。確認してほしい内容・確認した内容はどちらも任意入力です。</p>
        {progressReports.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">案件報告はまだありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 880 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">分類</th>
                  <th className="px-3 py-2 text-left font-medium">報告者</th>
                  <th className="px-3 py-2 text-left font-medium">報告日</th>
                  <th className="px-3 py-2 text-left font-medium">内容</th>
                  <th className="px-3 py-2 text-left font-medium">確認コメント</th>
                  <th className="px-3 py-2 text-left font-medium">確認者</th>
                  <th className="px-3 py-2 text-left font-medium">ステータス</th>
                  <th className="px-3 py-2 text-left font-medium">確認日付</th>
                  <th className="px-3 py-2 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {progressReports.map(pr => {
                  const confirmer = allMembers.find(m => m.id === pr.confirmer_id)
                  const isRequester = !!currentMemberId && pr.requester_id === currentMemberId
                  const canConfirm = pr.status === '依頼中' && !!currentMemberId && !isRequester
                  const kind = (pr.kind ?? 'progress_check') as ProgressReportKind
                  return (
                    <tr key={pr.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold border ${KIND_CHIP[kind]}`}>{KIND_LABEL[kind]}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">{memberName(pr.requester_id)}</td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{pr.requested_date}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[220px] whitespace-pre-wrap">{pr.review_point || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[220px] whitespace-pre-wrap">{pr.confirm_comment || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {confirmer ? (
                          <span className="inline-flex items-center gap-1.5"><UserAvatar name={confirmer.name} url={confirmer.avatar_url} size="sm" /><span className="text-[12px] text-gray-700">{confirmer.name}</span></span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${pr.status === '確認済' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{pr.status === '依頼中' ? '報告中' : pr.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{pr.confirmed_date ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right">
                        {canConfirm && (
                          <button type="button" onClick={() => { setConfirmTarget(pr); setConfirmComment('') }} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap">
                            <Check className="w-3 h-3" strokeWidth={2.25} />確認する
                          </button>
                        )}
                        {pr.status === '依頼中' && isRequester && <span className="text-[11px] text-gray-400">本人は確認不可</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      )}

      {/* 報連相・メモ */}
      {section !== 'report' && (
      <Section title="報連相・メモ">
        <div className="flex flex-wrap justify-end gap-2 mb-2.5">
          <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => setHouRenSouOpen(true)}>
            報連相
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />} onClick={() => setAddTaskOpen(true)}>
            タスク化
          </Button>
        </div>

        {/* 報連相の履歴（案件報告と同じテイスト） */}
        {caseReports.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 880 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">種別</th>
                  <th className="px-3 py-2 text-left font-medium">依頼者</th>
                  <th className="px-3 py-2 text-left font-medium">依頼日</th>
                  <th className="px-3 py-2 text-left font-medium">通知先</th>
                  <th className="px-3 py-2 text-left font-medium">内容</th>
                  <th className="px-3 py-2 text-left font-medium">確認コメント</th>
                  <th className="px-3 py-2 text-left font-medium">確認者</th>
                  <th className="px-3 py-2 text-left font-medium">ステータス</th>
                  <th className="px-3 py-2 text-left font-medium">確認日付</th>
                  <th className="px-3 py-2 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {caseReports.map(cr => {
                  const confirmer = allMembers.find(m => m.id === cr.confirmer_id)
                  const isRequester = !!currentMemberId && cr.requester_id === currentMemberId
                  const canConfirm = cr.status === '依頼中' && !!currentMemberId && !isRequester
                  const kindColor = cr.kind === '相談' ? 'bg-amber-50 text-amber-700' : cr.kind === '連絡' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                  return (
                    <tr key={cr.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2.5"><span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold ${kindColor}`}>{cr.kind}</span></td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">{memberName(cr.requester_id)}</td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{cr.requested_date}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">{(cr.recipient_ids ?? []).map(memberName).join(', ') || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[220px] whitespace-pre-wrap">{cr.message || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[220px] whitespace-pre-wrap">{cr.confirm_comment || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {confirmer ? (
                          <span className="inline-flex items-center gap-1.5"><UserAvatar name={confirmer.name} url={confirmer.avatar_url} size="sm" /><span className="text-[12px] text-gray-700">{confirmer.name}</span></span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${cr.status === '確認済' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{cr.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{cr.confirmed_date ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right">
                        {canConfirm && (
                          <button type="button" onClick={() => { setConfirmReport(cr); setConfirmReportComment('') }} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap">
                            <Check className="w-3 h-3" strokeWidth={2.25} />確認する
                          </button>
                        )}
                        {cr.status === '依頼中' && isRequester && <span className="text-[11px] text-gray-400">本人は確認不可</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* メモ入力欄（従来） */}
        <div className="flex gap-2 items-start mb-3">
          <div className="flex-1 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <select
                value={newKotei}
                onChange={e => { const k = e.target.value; setNewKotei(k); setNewGyomu((KOTEI_GYOMU[k] ?? [])[0] ?? '') }}
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-brand-400"
                style={{ minWidth: 130 }}
              >
                <option value="">工程（任意）</option>
                {KOTEI_ORDER.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select
                value={newGyomu}
                onChange={e => setNewGyomu(e.target.value)}
                disabled={!newKotei}
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-brand-400 disabled:bg-gray-50 disabled:text-gray-400"
                style={{ minWidth: 120 }}
              >
                <option value="">業務区分</option>
                {(KOTEI_GYOMU[newKotei] ?? []).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="タイトル（任意）"
                className="flex-1 min-w-[140px] text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
              />
            </div>
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              placeholder="例：Aさんが戸籍請求中（□□市）"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <button
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '追加中...' : '追加'}
          </button>
        </div>

        {/* 工程フィルタ */}
        {noteKoteiOptions.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-500">工程</span>
            <button type="button" onClick={() => { setKoteiFilter(''); setGyomuFilter('') }} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${!koteiFilter ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>すべて</button>
            {noteKoteiOptions.map(k => (
              <button key={k} type="button" onClick={() => { setKoteiFilter(k); setGyomuFilter('') }} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${koteiFilter === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{k}</button>
            ))}
          </div>
        )}
        {/* 業務区分フィルタ */}
        {noteGyomuOptions.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-500">業務区分</span>
            <button type="button" onClick={() => setGyomuFilter('')} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${!gyomuFilter ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>すべて</button>
            {noteGyomuOptions.map(g => (
              <button key={g} type="button" onClick={() => setGyomuFilter(g)} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${gyomuFilter === g ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{g}</button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="text-center text-sm text-gray-400 py-4">読み込み中...</div>
        ) : notes.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-4">メモはまだありません</div>
        ) : (
          <div className="space-y-2.5">
            {notes.map(n => {
              // タイトル＝任意文字 or タスク名（リンク）。タスクに紐づく場合は飛べる。
              const titleText = n.title?.trim() || n.tasks?.title || null
              const linkedTaskStatus = n.task_id ? taskStatusMap.get(n.task_id) : undefined
              const isCompleted = linkedTaskStatus === '完了'
              const gy = noteGyomu(n)
              const ko = noteKotei(n)
              return (
                <div key={n.id} className="flex gap-2.5 border-b border-gray-50 last:border-b-0 pb-2.5 last:pb-0">
                  {isCompleted
                    ? <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                    : <StickyNote className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" strokeWidth={2} />}
                  <div className="flex-1 min-w-0">
                    {ko && <span className="inline-block mb-0.5 mr-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: (KOTEI_COLOR[ko] ?? { bg: '#F1EFE8' }).bg, color: (KOTEI_COLOR[ko] ?? { text: '#444441' }).text }}>{koteiLabel(ko)}</span>}
                    {gy && <span className="inline-block mb-0.5 mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-600 bg-gray-100/80 border border-gray-200">{gy}</span>}
                    {titleText && (
                      n.task_id ? (
                        <Link href={`/tasks/${n.task_id}`} className={`inline-flex items-center gap-1 text-[13px] font-semibold hover:underline ${isCompleted ? 'text-emerald-700' : 'text-brand-700'}`}>
                          {titleText}<ExternalLink className="w-3 h-3 opacity-60" />
                          {isCompleted && <span className="ml-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 rounded">完了</span>}
                        </Link>
                      ) : (
                        <div className="text-[13px] font-semibold text-gray-800">{titleText}</div>
                      )
                    )}
                    <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{n.description}</div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                      {n.activity_date}{n.members?.name ? ` · ${n.members.name}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>
      )}

      {/* 案件報告まわりのモーダル群（報連相・メモのみ表示時は不要） */}
      {section !== 'memo' && (<>
      {/* 統一報告モーダル。分類select + 内容textarea。分類=業務完了申請の時のみ選択直後にゲート判定。 */}
      <Modal
        isOpen={requestOpen}
        onClose={() => { setRequestOpen(false); setReportKind('progress_check') }}
        title="報告"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setRequestOpen(false); setReportKind('progress_check') }} disabled={requesting}>キャンセル</Button>
            <Button variant="primary" onClick={handleRequestReview} loading={requesting} leftIcon={<Send className="w-3.5 h-3.5" strokeWidth={2} />}>報告する</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-semibold text-gray-600 mb-1">分類</label>
            <select
              value={reportKind}
              onChange={e => handleKindChange(e.target.value as ProgressReportKind)}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            >
              <option value="progress_check">案件報告</option>
              <option value="work_complete">業務完了申請</option>
              <option value="case_reopen">案件再オープン</option>
              <option value="delivery_confirm">納品確認申請</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {reportKind === 'work_complete' && '受注担当の承認後に業務完了になります。全請求発行済＋他事業者請求済が必要。'}
              {reportKind === 'case_reopen' && '業務完了/納品完了後に追加業務が発生した場合。案件が「案件進行中」に戻ります。'}
              {reportKind === 'delivery_confirm' && '納品対象書類が確定したら受注担当に確認依頼。承認後「納品待ち」になります。'}
              {reportKind === 'progress_check' && '受注担当に案件の進捗状況を確認してもらいます。'}
            </p>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-gray-600 mb-1">
              {reportKind === 'case_reopen' ? '事由' : '内容'} <span className="font-normal text-gray-400">（任意）</span>
            </label>
            <textarea
              value={reviewPointInput}
              onChange={e => setReviewPointInput(e.target.value)}
              placeholder={KIND_PLACEHOLDER[reportKind]}
              rows={4}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y"
            />
          </div>
        </div>
      </Modal>

      {/* 業務完了申請 ゲート未達 ポップアップ */}
      <Modal
        isOpen={!!completionBlocked}
        onClose={() => setCompletionBlocked(null)}
        title="請求が完了していないため、業務完了申請できません"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompletionBlocked(null)}>閉じる</Button>
            {completionBlocked?.missingReferrals?.length ? (
              <Button variant="secondary" onClick={() => { setCompletionBlocked(null); router.push(`/cases/${caseData.id}?tab=referral`) }}>他事業者紹介タブを開く</Button>
            ) : null}
            <Button variant="primary" onClick={() => { setCompletionBlocked(null); router.push(`/cases/${caseData.id}?tab=contract`) }}>請求タブを開く</Button>
          </>
        }
      >
        {completionBlocked && (
          <div className="space-y-3">
            <p className="text-[13px] text-gray-700">下記が全て解消してから、業務完了申請を送信できます。</p>
            {completionBlocked.missing.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-gray-600 mb-1">未発行の請求 ({completionBlocked.missing.length}件)</div>
                <ul className="text-[12.5px] text-gray-700 list-disc pl-5 space-y-0.5">
                  {completionBlocked.missing.map(m => <li key={m.id}>{m.firmLabel ? `[${m.firmLabel}] ` : ''}{m.typeLabel}</li>)}
                </ul>
              </div>
            )}
            {completionBlocked.missingReferrals.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-gray-600 mb-1">他事業者紹介の請求未完了 ({completionBlocked.missingReferrals.length}件)</div>
                <ul className="text-[12.5px] text-gray-700 list-disc pl-5 space-y-0.5">
                  {completionBlocked.missingReferrals.map(r => <li key={r.id}>{r.partnerType}：{r.content || '（依頼内容未入力）'} ← 報酬請求状態 「{r.billingStatus}」</li>)}
                </ul>
              </div>
            )}
            {completionBlocked.pendingRefunds.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-gray-600 mb-1">未処理の返金 ({completionBlocked.pendingRefunds.length}件)</div>
                <ul className="text-[12.5px] text-gray-700 list-disc pl-5 space-y-0.5">
                  {completionBlocked.pendingRefunds.map(r => <li key={r.id}>{r.requested_date} 返金申請</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 確認モーダル（確認した内容＝任意）。分類に応じてボタンを切替。
          progress_check / case_reopen → 「確認した」＋（progress_checkのみ）「確認してタスク化」
          work_complete / delivery_confirm → 「承認」＋「差戻し」 */}
      <Modal
        isOpen={!!confirmTarget}
        onClose={() => { setConfirmTarget(null); setConfirmComment('') }}
        title={confirmTarget ? KIND_LABEL[(confirmTarget.kind ?? 'progress_check') as ProgressReportKind] : '案件報告'}
        footer={confirmTarget ? (() => {
          const kind = (confirmTarget.kind ?? 'progress_check') as ProgressReportKind
          const isApproval = kind === 'work_complete' || kind === 'delivery_confirm'
          return (
            <>
              <Button variant="secondary" onClick={() => { setConfirmTarget(null); setConfirmComment('') }} disabled={confirmSaving}>キャンセル</Button>
              {isApproval ? (
                <>
                  <Button variant="secondary" onClick={() => handleConfirm(confirmTarget, 'reject')} loading={confirmSaving}>差戻し</Button>
                  <Button variant="primary" onClick={() => handleConfirm(confirmTarget, 'confirm')} loading={confirmSaving} leftIcon={<Check className="w-3.5 h-3.5" strokeWidth={2.25} />}>承認する</Button>
                </>
              ) : (
                <>
                  {kind === 'progress_check' && (
                    <Button variant="secondary" onClick={() => openTaskModal(confirmTarget)} disabled={confirmSaving} leftIcon={<ListPlus className="w-3.5 h-3.5" strokeWidth={2} />}>確認してタスク化</Button>
                  )}
                  <Button variant="primary" onClick={() => handleConfirm(confirmTarget)} loading={confirmSaving} leftIcon={<Check className="w-3.5 h-3.5" strokeWidth={2.25} />}>確認した</Button>
                </>
              )}
            </>
          )
        })() : undefined}
      >
        {confirmTarget && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold border ${KIND_CHIP[(confirmTarget.kind ?? 'progress_check') as ProgressReportKind]}`}>
                {KIND_LABEL[(confirmTarget.kind ?? 'progress_check') as ProgressReportKind]}
              </span>
            </div>
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-gray-600">
                {(confirmTarget.kind ?? 'progress_check') === 'case_reopen' ? '事由' : '報告内容'}
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{confirmTarget.review_point || <span className="text-gray-400">（指定なし）</span>}</div>
                <div className="text-[11px] text-gray-400 mt-1">{memberName(confirmTarget.requester_id)} ・ {confirmTarget.requested_date} 報告</div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-gray-600">確認した内容 <span className="font-normal text-gray-400">（任意）</span></label>
              <textarea
                value={confirmComment}
                onChange={e => setConfirmComment(e.target.value)}
                placeholder="例：戸籍と照合し相続人3名で相違なしを確認"
                rows={4}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 「確認してタスク化」→ タスクタブと同じ AddTaskModal を使う。保存後に対象progress_reportを確認済に。 */}
      <AddTaskModal
        isOpen={!!taskModalPr}
        onClose={() => setTaskModalPr(null)}
        caseId={caseData.id}
        allMembers={allMembers}
        onSaved={finalizeTaskizeFlow}
      />
      </>)}

      {/* 報連相の確認モーダル（案件報告と同じテイスト） */}
      <Modal
        isOpen={!!confirmReport}
        onClose={() => { setConfirmReport(null); setConfirmReportComment('') }}
        title={confirmReport ? `${confirmReport.kind}を確認` : '確認'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setConfirmReport(null); setConfirmReportComment('') }} disabled={confirmReportSaving}>キャンセル</Button>
            <Button variant="primary" onClick={() => confirmReport && handleConfirmReport(confirmReport)} loading={confirmReportSaving} leftIcon={<Check className="w-3.5 h-3.5" strokeWidth={2.25} />}>確認した</Button>
          </>
        }
      >
        {confirmReport && (
          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gray-400 mb-0.5">{confirmReport.kind} の内容</div>
              <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{confirmReport.message || <span className="text-gray-400">（本文なし）</span>}</div>
              <div className="text-[11px] text-gray-400 mt-1">{memberName(confirmReport.requester_id)} ・ {confirmReport.requested_date} 送信</div>
            </div>
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-gray-600">確認した内容 <span className="font-normal text-gray-400">（任意）</span></label>
              <textarea
                value={confirmReportComment}
                onChange={e => setConfirmReportComment(e.target.value)}
                placeholder="例：内容を確認しました／◯◯の方針で対応します"
                rows={4}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 報連相モーダル（右上ボタンから） */}
      <HourenSouModal
        isOpen={houRenSouOpen}
        onClose={() => setHouRenSouOpen(false)}
        caseData={caseData}
        currentMemberId={currentMemberId}
        salesMemberId={salesMemberId}
        allMembers={allMembers}
        onSent={fetchActivities}
      />

      {/* タスク化モーダル（右上ボタンから：受注/管理担当タスクを新規作成） */}
      <AddTaskModal
        isOpen={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        caseId={caseData.id}
        allMembers={allMembers}
        onSaved={fetchActivities}
      />
    </div>
  )
}
