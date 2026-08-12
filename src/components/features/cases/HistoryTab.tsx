'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { StickyNote, ExternalLink, CheckCircle2 as CheckIcon, Send, Check, ListPlus, MessageSquare, Plus } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'
import { Section } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { CASE_REPORT_STATUS_LABEL } from '@/lib/caseReports'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import { koteiOf, koteiRank, koteiLabel, KOTEI_ORDER, KOTEI_GYOMU, KOTEI_COLOR } from '@/lib/kotei'
import AddTaskModal from './AddTaskModal'
import { useCaseCompose } from './CaseComposeContext'
import type { CaseActivityRow, MemberRow, ProgressReportRow, ProgressReportKind, CaseReportRow, CaseRow } from '@/types'
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
// 案件報告の状態バッジ配色（緑=順調／青=確認事項／琥珀=HELP／赤=至急）
const STATE_CHIP: Record<string, string> = {
  '問題なし順調に進行中': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '確認事項あり': 'bg-blue-50 text-blue-700 border-blue-200',
  '困りごとありHELP': 'bg-amber-50 text-amber-700 border-amber-200',
  '至急！！': 'bg-red-100 text-red-700 border-red-300',
}
const stateChip = (s: string | null | undefined) => (s && STATE_CHIP[s]) || 'bg-gray-50 text-gray-500 border-gray-200'

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
  /** 承認通知(approve=1)から遷移した時：自分が承認すべき依頼中の報告を自動でモーダル表示する */
  autoOpenPending?: boolean
}

/**
 * 進捗報告・メモ（案件進捗タブの子タブ）。
 * 進捗報告と進捗メモを縦に並べて両方表示する（旧・内部タブ分けは解消）。
 * 進捗確認の依頼は「この案件の管理担当」だけが、確認者＝受注担当に対して出せる。
 */
export default function HistoryTab({ caseData, allMembers, currentMemberId: serverMemberId, canRequestReview = false, tasks = [], section, openReportId, autoOpenPending = false }: Props) {
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
  const router = useRouter()
  // 案件報告・報連相の作成ウィンドウは案件詳細ルート(CaseComposeProvider)に持ち上げ済み。
  // ボタンはここで open を呼び、送信後は compose.refreshKey の変化で一覧を再取得する。
  const compose = useCaseCompose()
  const [confirmTarget, setConfirmTarget] = useState<ProgressReportRow | null>(null)
  const [confirmComment, setConfirmComment] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)
  // 「確認してタスク化」時にどの案件報告を対象にするかを保持（AddTaskModal 保存後に確認済にセット）
  const [taskModalPr, setTaskModalPr] = useState<ProgressReportRow | null>(null)
  // 報連相（case_reports）と、右上ボタンのモーダル制御
  const [caseReports, setCaseReports] = useState<CaseReportRow[]>([])
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

  // 案件IDが変わったら／作成ウィンドウで送信された(compose.refreshKey)らサーバーから再取得
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchActivities() }, [caseData.id, compose?.refreshKey])

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
    if (error) { console.error('progress_reports confirm failed:', error); showToast(`確認に失敗しました: ${error.message}`, 'error'); return }

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

  // 報連相を「確認中」にする：見て動き出したことを送り手に見せる（回答はまだ）。
  const markReviewing = async (cr: CaseReportRow) => {
    if (!currentMemberId) return
    const supabase = createClient()
    const { error } = await supabase.from('case_reports')
      .update({ status: '確認中', reviewing_by: currentMemberId, reviewing_at: new Date().toISOString() })
      .eq('id', cr.id)
    if (error) { showToast('確認中にできませんでした', 'error'); return }
    if (cr.requester_id) {
      await supabase.from('notifications').insert({
        member_id: cr.requester_id,
        type: 'case_report_confirmed',
        case_id: caseData.id,
        title: '報連相が確認中になりました',
        body: `${caseData.case_number} ${caseData.deal_name}：${memberName(currentMemberId)} さんが確認中です`,
      })
    }
    showToast('確認中にしました', 'success')
    fetchActivities()
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

  // 通知から遷移した時：該当ID(progress_reports/case_reports)の確認モーダルを自動オープン。
  //   ※一度だけ。確認/送信でリスト(progressReports)が変わっても再オープンしない（＝閉じられなくなるのを防ぐ）。
  const openedReportRef = useRef(false)
  useEffect(() => {
    if (!openReportId || openedReportRef.current) return
    const pr = progressReports.find(r => r.id === openReportId)
    if (pr) { openedReportRef.current = true; setConfirmTarget(pr); setConfirmComment(''); return }
    const cr = caseReports.find(r => r.id === openReportId)
    if (cr) { openedReportRef.current = true; setConfirmReport(cr); setConfirmReportComment('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReportId, progressReports, caseReports])

  // 承認通知(approve=1)から案件報告サブタブへ来たが openReport 指定が無い場合：
  //   自分が承認すべき「依頼中」の報告（自分が報告者でないもの・最新）を1件だけ自動でモーダル表示する。
  //   通知テーブルに report_id を持たせていないため、業務完了申請等の承認導線をこのフォールバックで担保する。
  //   ※ 手動で案件報告サブタブを開いた時に勝手に出さないよう、通知経由(autoOpenPending)のときだけ発火。
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (openReportId || !autoOpenPending || autoOpenedRef.current || !currentMemberId) return
    // progressReports は requested_date 降順。承認対象＝依頼中 かつ 報告者が自分でない 最新の1件。
    const target = progressReports.find(r => r.status === '依頼中' && r.requester_id !== currentMemberId)
    if (target) { autoOpenedRef.current = true; setConfirmTarget(target); setConfirmComment('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReportId, autoOpenPending, progressReports, currentMemberId])

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
  // メモ一覧: 手動追加(HistoryTab の入力欄で書いたメモ)のみ表示。
  //   タスクに紐づく自動生成メモ(task_id あり = タスクの実施結果を自動転記した旧仕様)は除外。
  const notes = activities
    .filter(a => a.activity_type === 'note' && !a.task_id)
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
      {/* タブ上部の共通アクション（セクションの外・余白なしで並べる） */}
      <div className="flex flex-wrap justify-end gap-2">
        {section !== 'memo' && canRequestReview && (
          <Button variant="secondary" size="sm" leftIcon={<Send className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => compose?.openReport()}>
            報告する
          </Button>
        )}
        <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => compose?.openHourenSou()}>
          報連相
        </Button>
        <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />} onClick={() => setAddTaskOpen(true)}>
          タスク化
        </Button>
      </div>

      {/* 案件報告 */}
      {section !== 'memo' && (
      <Section title="案件報告">
        <p className="text-[11px] text-gray-400 mb-2.5">「案件報告」→相手の席で一緒に確認→<span className="font-medium text-gray-500">確認した本人が自分のPCで「確認した」</span>を押します（報告した本人は押せません）。確認してほしい内容・確認した内容はどちらも任意入力です。</p>
        {progressReports.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">案件報告はまだありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 1000 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">分類</th>
                  <th className="px-3 py-2 text-left font-medium">フェーズ</th>
                  <th className="px-3 py-2 text-left font-medium">状態</th>
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
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">{pr.phase || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {pr.report_state
                          ? <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold border ${stateChip(pr.report_state)}`}>{pr.report_state}</span>
                          : <span className="text-gray-300">—</span>}
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

      {/* 報連相 セクション */}
      {section !== 'report' && (
      <Section title="報連相">
        {caseReports.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">報連相はまだありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 1000 }}>
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
                  // 受け取った人は「確認中にする」で一旦止められる。回答（確認する）は最後まで押せる。
                  const canConfirm = cr.status !== '確認済' && !!currentMemberId && !isRequester
                  const canReview = cr.status === '依頼中' && !!currentMemberId && !isRequester
                  const kindColor = cr.kind === '要対応' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${
                          cr.status === '確認済' ? 'bg-emerald-50 text-emerald-700'
                          : cr.status === '確認中' ? 'bg-sky-50 text-sky-700'
                          : 'bg-amber-50 text-amber-700'}`}>{CASE_REPORT_STATUS_LABEL[cr.status] ?? cr.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{cr.confirmed_date ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right">
                        {canReview && (
                          <button type="button" onClick={() => markReviewing(cr)} className="inline-flex items-center gap-1 px-2.5 py-1 mr-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 whitespace-nowrap">
                            確認中にする
                          </button>
                        )}
                        {canConfirm && (
                          <button type="button" onClick={() => { setConfirmReport(cr); setConfirmReportComment('') }} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap">
                            <Check className="w-3 h-3" strokeWidth={2.25} />{cr.kind === '要対応' ? '回答する' : '確認した'}
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

      </Section>
      )}

      {/* メモ セクション（報連相とは別セクション） */}
      {section !== 'report' && (
      <Section title="メモ">
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
          // 報告した本人は確認/承認できない（押しても弾かれて閉じられなくなるため、ボタン自体を出さない）。
          const isOwn = !!currentMemberId && confirmTarget.requester_id === currentMemberId
          if (isOwn) {
            return (
              <>
                <span className="mr-auto text-[12px] text-gray-400 self-center">報告した本人は確認できません</span>
                <Button variant="secondary" onClick={() => { setConfirmTarget(null); setConfirmComment('') }}>閉じる</Button>
              </>
            )
          }
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
