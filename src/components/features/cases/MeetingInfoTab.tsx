'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  Section, FieldGrid, Field, InlineEdit, InlineSelect, InlineMultiSelect,
  InlineDate, InlineMemberSelect, InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  PROCEDURE_TYPES, LOST_REASONS, MEETING_PLACES, CONTRACT_TYPES,
  getSelectableCaseStatuses, getCaseStatusLabel, REFERRAL_PARTNER_TYPES, isInitialTasksDone,
} from '@/lib/constants'
import type { CaseRow, CaseMemberRow, MemberRow, CaseReferralRow, TaskRow, ContractDocumentRow } from '@/types'
import ProcedureIntakeSection from './ProcedureIntakeSection'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  allMembers: MemberRow[]
  onRefresh?: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // 他事業者紹介要否チェック用（チェック＝case_referrals行を作成）
  referrals?: CaseReferralRow[]
  // 受託→対応中ゲート（初期対応タスク完了）の判定用
  tasks?: TaskRow[]
  // 契約手続きの受領書類（受信簿連動）
  contractDocuments?: ContractDocumentRow[]
  // 契約残手続き完了か（対応中ガード用）
  contractProcDone?: boolean
}

/**
 * 面談情報タブ
 * 案件作成（面談）時に登録する情報を、面談に特化した4セクションで表示・編集する。
 *   ① 案件情報   : 案件管理番号 / 受注担当 / 案件ステータス / 案件作成日
 *   ② 面談概要   : 面談予定日 / 面談実施日 / 面談場所 / お客様回答予定日 / 伺い先
 *   ③ 面談内容   : ヒアリング内容メモ / 受注見込み手続き区分 / 失注理由 / その他備考
 *   ④ 相談事前情報: LP担当が面談前にヒアリングした事前情報（アコーディオン・既定で閉じる）
 *
 * ※ 担当者・受注内容・受注ルートは「担当・受注内容」タブへ移設。
 * ※ 他事業者紹介要否（税理士/弁護士/不動産/遺品整理）は「他事業者紹介」タブで管理。
 */
export default function MeetingInfoTab({ caseData, caseMembers, allMembers, onRefresh, patchCase, referrals = [], tasks = [], contractDocuments = [], contractProcDone = true }: Props) {
  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  const salesMembers = caseMembers.filter(cm => cm.role === 'sales')
  const managerAssigned = caseMembers.some(cm => cm.role === 'manager')
  const initialTasksDone = isInitialTasksDone(tasks)

  return (
    <div className="space-y-3.5">
      {/* ① 案件情報 */}
      <Section title="案件情報">
        <FieldGrid>
          <InlineEdit label="案件管理番号" value={caseData.case_number} onSave={v => saveCaseField('case_number', v)} required />
          <InlineMemberSelect
            label="受注担当"
            roleKey="sales"
            assigned={salesMembers}
            allMembers={allMembers}
            caseId={caseData.id}
            onRefresh={onRefresh}
            multi={false}
          />
          <InlineSelect
            label="案件ステータス"
            value={caseData.status}
            options={getSelectableCaseStatuses(!!caseData.order_sheet_completed_at, caseData.status, managerAssigned, initialTasksDone, contractProcDone)}
            optionLabel={getCaseStatusLabel}
            onSave={v => saveCaseField('status', v)}
          />
          <Field label="案件作成日" value={caseData.created_at ? caseData.created_at.slice(0, 10) : null} mono />
        </FieldGrid>
      </Section>

      {/* ② 面談概要 */}
      <Section title="面談概要">
        <FieldGrid>
          <InlineDate label="面談予定日"        value={caseData.meeting_date}             onSave={v => saveCaseField('meeting_date', v || null)} />
          <InlineDate label="面談実施日"        value={caseData.meeting_executed_date}    onSave={v => saveCaseField('meeting_executed_date', v || null)} />
          <InlineSelect label="面談場所"        value={caseData.meeting_place}            options={[...MEETING_PLACES]} onSave={v => saveCaseField('meeting_place', v)} />
          <InlineDate label="お客様回答予定日"  value={caseData.client_response_due_date} onSave={v => saveCaseField('client_response_due_date', v || null)} />
          <InlineEdit label="伺い先住所"        value={caseData.visit_address}            onSave={v => saveCaseField('visit_address', v)} fullWidth />
          <InlineEdit label="伺い先補足"        value={caseData.visit_notes}              onSave={v => saveCaseField('visit_notes', v)} fullWidth />
        </FieldGrid>
      </Section>

      {/* ③ 面談内容 */}
      <Section title="面談内容">
        <FieldGrid>
          <InlineTextarea label="ヒアリング内容メモ" value={caseData.meeting_hearing_memo} onSave={v => saveCaseField('meeting_hearing_memo', v)} fullWidth />
          <InlineMultiSelect
            label="受注見込み手続き区分"
            value={caseData.procedure_type}
            options={[...PROCEDURE_TYPES]}
            onSave={v => saveCaseField('procedure_type', v)}
            fullWidth
          />
          <InlineSelect label="契約形態" value={caseData.contract_type} options={[...CONTRACT_TYPES]} onSave={v => saveCaseField('contract_type', v)} />
          <InlineSelect label="失注理由" value={caseData.lost_reason} options={[...LOST_REASONS]} onSave={v => saveCaseField('lost_reason', v)} />
          <InlineTextarea label="その他備考" value={caseData.meeting_other_notes} onSave={v => saveCaseField('meeting_other_notes', v)} fullWidth />
        </FieldGrid>

        {/* 他事業者紹介要否（チェック＝「他事業者紹介」タブに業者サブタブを作成） */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <ReferralToggles caseId={caseData.id} referrals={referrals} onRefresh={onRefresh} />
        </div>
      </Section>

      {/* 手続き詳細（受領書類・役割分担） */}
      <ProcedureIntakeSection caseData={caseData} patchCase={patchCase} contractDocuments={contractDocuments} onRefresh={onRefresh} />

      {/* ④ 相談事前情報（LP連携の面談前ヒアリング。LP経由でない案件は空のため既定で閉じる） */}
      <Section title="相談事前情報" collapsible defaultOpen={false}>
        <FieldGrid>
          <InlineTextarea label="ヒアリング内容"      value={caseData.hearing_content} onSave={v => saveCaseField('hearing_content', v)} fullWidth />
          <InlineTextarea label="特記事項（社内のみ）" value={caseData.special_notes}   onSave={v => saveCaseField('special_notes', v)} fullWidth />
          <InlineTextarea label="その他ニーズ"        value={caseData.other_needs}     onSave={v => saveCaseField('other_needs', v)} fullWidth />
        </FieldGrid>
      </Section>
    </div>
  )
}

// 他事業者紹介要否チェック。チェック＝case_referrals 行を作成（→「他事業者紹介」タブにサブタブ出現）、
// 外す＝行を削除（入力済みデータがある場合は確認）。
function ReferralToggles({ caseId, referrals, onRefresh }: {
  caseId: string
  referrals: CaseReferralRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const byType = new Map(referrals.map(r => [r.partner_type, r]))

  const toggle = async (partnerType: string, checked: boolean) => {
    setBusy(true)
    if (checked) {
      const { error } = await supabase.from('case_referrals').insert({ case_id: caseId, partner_type: partnerType })
      setBusy(false)
      if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    } else {
      const row = byType.get(partnerType)
      const hasData = !!(row && (row.firm_name || row.referred_date || row.content || row.estimated_fee != null || row.billing_status))
      if (hasData && !confirm(`「${partnerType}」の紹介情報を削除しますか？入力済みの内容も消えます。`)) { setBusy(false); return }
      if (row) {
        const { error } = await supabase.from('case_referrals').delete().eq('id', row.id)
        setBusy(false)
        if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
      } else {
        setBusy(false)
      }
    }
    onRefresh?.()
  }

  return (
    <div>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1.5">他事業者紹介要否</div>
      <div className="flex flex-wrap gap-2">
        {REFERRAL_PARTNER_TYPES.map(t => {
          const checked = byType.has(t)
          return (
            <label
              key={t}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] cursor-pointer transition-colors ${
                checked ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={e => toggle(t, e.target.checked)}
                className="w-3.5 h-3.5 accent-brand-600"
              />
              {t}
            </label>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">
        チェックすると「他事業者紹介」タブに業者ごとのサブタブが作成されます。
      </p>
    </div>
  )
}
