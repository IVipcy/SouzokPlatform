'use client'

// 案件報告・報連相の作成ウィンドウを案件詳細ルートで描画するプロバイダ。
// ウィンドウはタブ内ではなくここ（ルート）に置くので、どのタブに切り替えても浮いたまま残る。
// 送信/申請の実処理（progress_reports 挿入・ゲート判定・通知・status更新）もここに集約。

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import UserAvatar from '@/components/ui/UserAvatar'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { isUrgentReportState } from '@/lib/constants'
import { todayJstYmd } from '@/lib/today'
import ProgressReportComposeFields, { emptyProgressReportDraft, type ProgressReportDraft } from './ProgressReportComposeFields'
import HourenSouModal from './HourenSouModal'
import { resolveStartStatus } from './HandoffModal'
import { CaseComposeContext } from './CaseComposeContext'
import type { CaseRow, MemberRow, ProgressReportKind } from '@/types'

const KIND_LABEL: Record<ProgressReportKind, string> = {
  progress_check: '案件報告',
  work_complete: '業務完了申請',   // 旧フロー。過去のレコードの表示にだけ使う
  case_reopen: '案件再オープン',
  delivery_confirm: '納品確認申請',
}
const KIND_PLACEHOLDER: Record<ProgressReportKind, string> = {
  progress_check: '例：相続人の確定内容を一緒に確認してほしい',
  work_complete: '例：全請求発行済・追加補足あればどうぞ',
  case_reopen: '例：追加戸籍が発生。追加請求＋登記対応が必要',
  delivery_confirm: '例：納品書類の対象／対象外を確認してほしい',
}

export default function CaseComposeProvider({ caseData, allMembers, currentMemberId, salesMemberId, canRequestReview, latestCommunicationDate = null, children }: {
  caseData: CaseRow
  allMembers: MemberRow[]
  currentMemberId: string | null
  salesMemberId: string | null
  canRequestReview: boolean
  /** 依頼者連絡の最新日（案件報告の「最終連絡日」に写す） */
  latestCommunicationDate?: string | null
  children: ReactNode
}) {
  const router = useRouter()
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey(k => k + 1)

  // 案件報告ウィンドウ
  const [requestOpen, setRequestOpen] = useState(false)
  const [reportKind, setReportKind] = useState<ProgressReportKind>('progress_check')
  // 案件報告の中身（フェーズ・状態・報告内容・次回報告までの対応）。分類が案件報告以外のときは point だけ使う
  const [draft, setDraft] = useState<ProgressReportDraft>(() => emptyProgressReportDraft(currentMemberId))
  const patchDraft = (p: Partial<ProgressReportDraft>) => setDraft(prev => ({ ...prev, ...p }))
  const reportPhase = draft.phase, reportState = draft.state, reviewPointInput = draft.point
  const setReviewPointInput = (v: string) => patchDraft({ point: v })
  const [requesting, setRequesting] = useState(false)
  // 報連相ウィンドウ
  const [houRenSouOpen, setHouRenSouOpen] = useState(false)

  const memberName = (id: string | null) => (id ? allMembers.find(m => m.id === id)?.name ?? '—' : '—')

  const openReport = useCallback(() => { setDraft(emptyProgressReportDraft(currentMemberId)); setReportKind('progress_check'); setRequestOpen(true) }, [currentMemberId])

  // 業務完了は管理担当がステータスを直接「業務完了」にする運用にしたため、
  // 報告の分類からは外した（ここでのゲート判定も不要）。
  const handleKindChange = (next: ProgressReportKind) => setReportKind(next)

  const handleRequestReview = async () => {
    if (!canRequestReview) { showToast('案件報告は管理担当のみ可能です', 'error'); return }
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    setRequesting(true)
    const supabase = createClient()
    // 依頼日は日本時間の今日（UTC だと朝9時前に前日になる）
    const today = todayJstYmd()
    const isProgress = reportKind === 'progress_check'
    let { error } = await supabase.from('progress_reports').insert({
      case_id: caseData.id,
      requester_id: currentMemberId,
      confirmer_id: null,
      status: '依頼中',
      requested_date: today,
      review_point: reviewPointInput.trim() || null,
      kind: reportKind,
      phase: isProgress ? (reportPhase || null) : null,
      report_state: isProgress ? reportState : null,
      // 案件の現状（報告時点の値）と次回報告までの対応（migration 291）
      last_contact_date: isProgress ? (latestCommunicationDate || null) : null,
      expected_completion_date: isProgress ? (caseData.expected_completion_date || null) : null,
      next_action: isProgress ? (draft.nextAction.trim() || null) : null,
      next_action_assignee_id: isProgress ? (draft.nextAssigneeId || null) : null,
      next_action_due: isProgress ? (draft.nextDue || null) : null,
    })
    if (error && /kind|phase|report_state|next_action|last_contact|expected_completion/i.test(error.message ?? '')) {
      const retry = await supabase.from('progress_reports').insert({
        case_id: caseData.id,
        requester_id: currentMemberId,
        confirmer_id: null,
        status: '依頼中',
        requested_date: today,
        review_point: reviewPointInput.trim() || null,
      })
      error = retry.error
    }
    if (error) {
      console.error('progress_reports insert failed:', error)
      setRequesting(false)
      showToast(`報告に失敗しました: ${error.message}`, 'error')
      return
    }

    if (reportKind === 'case_reopen') {
      // 再オープンも着手ゲート（getSelectableCaseStatuses）を通す。業務完了・納品完了からは戻せるが、
      // ゲートが揃っていない案件を直接「作業進行中」にはしない（揃っていなければ作業着手準備に留める）。
      const gate = await resolveStartStatus(supabase, caseData.id)
      if (gate.next) await supabase.from('cases').update({ status: gate.next }).eq('id', caseData.id)
      if (gate.next !== '対応中') {
        showToast(`${gate.reasons.length ? gate.reasons.join('・') + 'ため、' : ''}案件は「作業進行中」にせず${gate.next ? '「作業着手準備」に留めました' : 'いまのステータスのままにしました'}`, 'error')
      }
    } else if (reportKind === 'delivery_confirm') {
      await supabase.from('cases').update({ delivery_status: '確認申請中' }).eq('id', caseData.id)
    }

    if (salesMemberId) {
      const kindLabel = KIND_LABEL[reportKind]
      const urgent = isProgress && isUrgentReportState(reportState)
      const meta = isProgress ? [reportPhase, reportState].filter(Boolean).join('・') : ''
      await supabase.from('notifications').insert({
        member_id: salesMemberId,
        type: 'progress_review_requested',
        case_id: caseData.id,
        title: `${urgent ? '【至急】' : ''}${kindLabel}が届きました`,
        body: `${caseData.case_number} ${caseData.deal_name}：${meta ? `[${meta}] ` : ''}${reviewPointInput.trim() || kindLabel + 'をお願いします'}`,
      })
    }
    setRequesting(false)
    setDraft(emptyProgressReportDraft(currentMemberId))
    setReportKind('progress_check')
    setRequestOpen(false)
    showToast(`${KIND_LABEL[reportKind]}を送信しました`, 'success')
    bump()
    router.refresh()
  }

  const api = useMemo(() => ({ openReport, openHourenSou: () => setHouRenSouOpen(true), refreshKey }), [openReport, refreshKey])

  return (
    <CaseComposeContext.Provider value={api}>
      {children}

      {/* 統一報告ウィンドウ（ドラッグ移動・暗幕なし・タブ切替でも残る） */}
      <FloatingWindow
        isOpen={requestOpen}
        onClose={() => { setRequestOpen(false); setReportKind('progress_check') }}
        title="案件報告"
        width={430}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setRequestOpen(false); setReportKind('progress_check') }} disabled={requesting}>キャンセル</Button>
            <Button variant="primary" size="sm" onClick={handleRequestReview} loading={requesting} leftIcon={<Send className="w-3.5 h-3.5" strokeWidth={2} />}>報告する</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">分類</label>
            <select
              value={reportKind}
              onChange={e => handleKindChange(e.target.value as ProgressReportKind)}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            >
              <option value="progress_check">案件報告</option>
              <option value="case_reopen">案件再オープン</option>
              <option value="delivery_confirm">納品確認申請</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {reportKind === 'case_reopen' && '業務完了/納品完了後に追加業務が発生した場合。案件が「作業進行中」に戻ります。'}
              {reportKind === 'delivery_confirm' && '納品対象書類が確定したら受注担当に確認依頼。承認後「納品待ち」になります。'}
              {reportKind === 'progress_check' && '受注担当に案件の進捗状況を報告します。確認はチームの誰でも押せます。'}
            </p>
          </div>

          {reportKind === 'progress_check' && (
            <>
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">報告先</label>
                {salesMemberId ? (
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-brand-200 bg-brand-50 text-[12.5px] font-semibold text-brand-800">
                    <UserAvatar name={memberName(salesMemberId)} url={allMembers.find(m => m.id === salesMemberId)?.avatar_url ?? null} size="sm" />
                    {memberName(salesMemberId)}
                    <span className="text-[10px] px-1 rounded bg-brand-600 text-white">受注担当</span>
                  </span>
                ) : (
                  <span className="text-[12px] text-gray-400">受注担当が未アサインです（通知は送られません）</span>
                )}
              </div>
              <ProgressReportComposeFields value={draft} onChange={patchDraft} lastContactDate={latestCommunicationDate} expectedCompletionDate={caseData.expected_completion_date ?? null} allMembers={allMembers} currentMemberId={currentMemberId} />
            </>
          )}

          {reportKind !== 'progress_check' && (
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">
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
          )}
        </div>
      </FloatingWindow>

      {/* 報連相ウィンドウ（ドラッグ移動・タブ切替でも残る） */}
      <HourenSouModal
        isOpen={houRenSouOpen}
        onClose={() => setHouRenSouOpen(false)}
        caseData={caseData}
        currentMemberId={currentMemberId}
        salesMemberId={salesMemberId}
        allMembers={allMembers}
        onSent={bump}
      />
    </CaseComposeContext.Provider>
  )
}
