'use client'

// 案件報告・報連相の作成ウィンドウを案件詳細ルートで描画するプロバイダ。
// ウィンドウはタブ内ではなくここ（ルート）に置くので、どのタブに切り替えても浮いたまま残る。
// 送信/申請の実処理（progress_reports 挿入・ゲート判定・通知・status更新）もここに集約。

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import UserAvatar from '@/components/ui/UserAvatar'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { PROGRESS_REPORT_PHASES, PROGRESS_REPORT_STATES, PROGRESS_REPORT_STATE_URGENT } from '@/lib/constants'
import { checkCaseCompletable, type MissingInvoice, type PendingRefund, type MissingReferral } from '@/lib/caseCompletionGate'
import HourenSouModal from './HourenSouModal'
import { CaseComposeContext } from './CaseComposeContext'
import type { CaseRow, MemberRow, ProgressReportKind } from '@/types'

const KIND_LABEL: Record<ProgressReportKind, string> = {
  progress_check: '案件報告',
  work_complete: '業務完了申請',
  case_reopen: '案件再オープン',
  delivery_confirm: '納品確認申請',
}
const KIND_PLACEHOLDER: Record<ProgressReportKind, string> = {
  progress_check: '例：相続人の確定内容を一緒に確認してほしい',
  work_complete: '例：全請求発行済・追加補足あればどうぞ',
  case_reopen: '例：追加戸籍が発生。追加請求＋登記対応が必要',
  delivery_confirm: '例：納品書類の対象／対象外を確認してほしい',
}
const STATE_CHIP: Record<string, string> = {
  '問題なし順調に進行中': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '確認事項あり': 'bg-blue-50 text-blue-700 border-blue-200',
  '困りごとありHELP': 'bg-amber-50 text-amber-700 border-amber-200',
  '至急！！': 'bg-red-100 text-red-700 border-red-300',
}
const stateChip = (s: string) => STATE_CHIP[s] ?? 'bg-gray-50 text-gray-500 border-gray-200'

export default function CaseComposeProvider({ caseData, allMembers, currentMemberId, salesMemberId, canRequestReview, children }: {
  caseData: CaseRow
  allMembers: MemberRow[]
  currentMemberId: string | null
  salesMemberId: string | null
  canRequestReview: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey(k => k + 1)

  // 案件報告ウィンドウ
  const [requestOpen, setRequestOpen] = useState(false)
  const [reportKind, setReportKind] = useState<ProgressReportKind>('progress_check')
  const [reportPhase, setReportPhase] = useState('')
  const [reportState, setReportState] = useState<string>(PROGRESS_REPORT_STATES[0])
  const [reviewPointInput, setReviewPointInput] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [completionBlocked, setCompletionBlocked] = useState<{ missing: MissingInvoice[]; pendingRefunds: PendingRefund[]; missingReferrals: MissingReferral[]; billingPattern: string; hasInvoices: boolean } | null>(null)
  // 報連相ウィンドウ
  const [houRenSouOpen, setHouRenSouOpen] = useState(false)

  const memberName = (id: string | null) => (id ? allMembers.find(m => m.id === id)?.name ?? '—' : '—')

  const openReport = () => { setReviewPointInput(''); setReportKind('progress_check'); setReportPhase(''); setReportState(PROGRESS_REPORT_STATES[0]); setRequestOpen(true) }

  // 分類を選んだ瞬間のゲート判定 (業務完了申請のみ)。未達ならウィンドウを閉じてポップアップで案内。
  const handleKindChange = async (next: ProgressReportKind) => {
    setReportKind(next)
    if (next === 'work_complete') {
      const supabase = createClient()
      const result = await checkCaseCompletable(supabase, caseData.id, caseData.billing_pattern)
      if (!result.ok) {
        setRequestOpen(false)
        setCompletionBlocked({ missing: result.missing, pendingRefunds: result.pendingRefunds, missingReferrals: result.missingReferrals, billingPattern: result.billingPattern, hasInvoices: result.hasInvoices })
      }
    }
  }

  const handleRequestReview = async () => {
    if (!canRequestReview) { showToast('案件報告は管理担当のみ可能です', 'error'); return }
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    setRequesting(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
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
    })
    if (error && /kind|phase|report_state/i.test(error.message ?? '')) {
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

    if (reportKind === 'work_complete') {
      await supabase.from('cases').update({ status: '業務完了申請中' }).eq('id', caseData.id)
    } else if (reportKind === 'case_reopen') {
      await supabase.from('cases').update({ status: '対応中' }).eq('id', caseData.id)
    } else if (reportKind === 'delivery_confirm') {
      await supabase.from('cases').update({ delivery_status: '確認申請中' }).eq('id', caseData.id)
    }

    if (salesMemberId) {
      const kindLabel = KIND_LABEL[reportKind]
      const urgent = isProgress && reportState === PROGRESS_REPORT_STATE_URGENT
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
    setReviewPointInput('')
    setReportKind('progress_check')
    setReportPhase('')
    setReportState(PROGRESS_REPORT_STATES[0])
    setRequestOpen(false)
    showToast(`${KIND_LABEL[reportKind]}を送信しました`, 'success')
    bump()
    router.refresh()
  }

  const api = useMemo(() => ({ openReport, openHourenSou: () => setHouRenSouOpen(true), refreshKey }), [refreshKey])

  return (
    <CaseComposeContext.Provider value={api}>
      {children}

      {/* 統一報告ウィンドウ（ドラッグ移動・暗幕なし・タブ切替でも残る） */}
      <FloatingWindow
        isOpen={requestOpen}
        onClose={() => { setRequestOpen(false); setReportKind('progress_check') }}
        title="案件報告"
        width={410}
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
              <option value="work_complete">業務完了申請</option>
              <option value="case_reopen">案件再オープン</option>
              <option value="delivery_confirm">納品確認申請</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {reportKind === 'work_complete' && '受注担当の承認後に業務完了になります。全請求発行済＋他事業者請求済が必要。'}
              {reportKind === 'case_reopen' && '業務完了/納品完了後に追加業務が発生した場合。案件が「作業進行中」に戻ります。'}
              {reportKind === 'delivery_confirm' && '納品対象書類が確定したら受注担当に確認依頼。承認後「納品待ち」になります。'}
              {reportKind === 'progress_check' && '受注担当に案件の進捗状況を確認してもらいます。'}
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
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">フェーズ</label>
                <select
                  value={reportPhase}
                  onChange={e => setReportPhase(e.target.value)}
                  className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                >
                  <option value="">フェーズを選択</option>
                  {PROGRESS_REPORT_PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">状態</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PROGRESS_REPORT_STATES.map(s => {
                    const on = reportState === s
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setReportState(s)}
                        className={`px-2 py-2 rounded-lg text-[12px] font-semibold border-[1.5px] transition-colors ${on ? stateChip(s) + ' ring-2 ring-offset-1 ' + (s === PROGRESS_REPORT_STATE_URGENT ? 'ring-red-300' : 'ring-brand-200') : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
                {reportState === PROGRESS_REPORT_STATE_URGENT && (
                  <p className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1"><span className="font-bold">⚠</span>「至急！！」は受注担当の要注意バナー（赤）に表示されます。</p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">
              {reportKind === 'case_reopen' ? '事由' : reportKind === 'progress_check' ? '報告内容' : '内容'} <span className="font-normal text-gray-400">（任意）</span>
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
      </FloatingWindow>

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
