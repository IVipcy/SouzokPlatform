'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  Section, FieldGrid, InlineEdit, InlineSelect,
  InlineDate, InlineMemberSelect, InlineTextarea, InlineCheckbox,
} from '@/components/ui/InlineFields'
import {
  CONSIDERATION_DECLINE_REASONS,
  getSelectableCaseStatuses, getCaseStatusLabel, REFERRAL_PARTNER_TYPES, isInitialTasksDone,
  CONSIDERATION_PERIODS, considerationDueMax, HEARING_MEMO_SAMPLE,
} from '@/lib/constants'
import { ORDER_CATEGORIES, KENIN_CATEGORY, KENIN_COMBO_SECONDARY, categoriesOf, seedRolesForCategories } from '@/lib/serviceMaster'
import type { CaseRow, CaseMemberRow, MemberRow, CaseReferralRow, TaskRow, ContractDocumentRow } from '@/types'
import { type RoleRow } from './ProcedureIntakeSection'
import TabHeader from './TabHeader'

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
 *   ③ 面談内容   : ヒアリング内容メモ / 受注区分（単一）→役割分担 / 検討中・不受託理由 / その他備考
 *   ④ 相談事前情報: LP担当が面談前にヒアリングした事前情報（アコーディオン・既定で閉じる）
 *
 * ※ 担当者・受注内容・受注ルートは「担当・受注内容」タブへ移設。
 * ※ 他事業者紹介要否（税理士/弁護士/不動産/遺品整理）は「他事業者紹介」タブで管理。
 */
export default function MeetingInfoTab({ caseData, caseMembers, allMembers, onRefresh, patchCase, referrals = [], tasks = [], contractProcDone = true }: Props) {
  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  // 検討期間区分を選ぶ → 回答予定日を「今日＋期間」を上限にそろえる（見込み不明は上限なし）
  const selectPeriod = async (p: string | null) => {
    const period = p || null
    const max = considerationDueMax(period)
    const patch: Partial<CaseRow> = { consideration_period: period }
    if (max && (!caseData.client_response_due_date || caseData.client_response_due_date > max)) patch.client_response_due_date = max
    await patchCase(patch)
  }

  // 受注区分①を選ぶ → 業務・作業を初期セット（区分変更時は入れ直し）。検認以外は②をクリア。
  const selectCategory = async (cat: string | null) => {
    const c = cat ?? ''
    if (c === (caseData.service_category ?? '')) return
    if (!c) { await patchCase({ service_category: null, service_category_2: null, procedure_type: null, intake_roles: [] }); return }
    if ((caseData.intake_roles?.length ?? 0) > 0 && !confirm('受注区分を変えると、業務・担当が新しい区分の初期値で入れ直されます。よろしいですか？')) return
    const newCat2 = c === KENIN_CATEGORY ? (caseData.service_category_2 ?? '') : ''
    const cats = categoriesOf(c, newCat2)
    const seeded = seedRolesForCategories(cats) as RoleRow[]
    // 一覧表示の互換のため procedure_type(配列) にも反映
    await patchCase({ service_category: c, service_category_2: newCat2 || null, procedure_type: cats, intake_roles: seeded })
  }

  // 検認①→手続き一式② の追加/解除
  const toggleFull = async (on: boolean) => {
    if ((caseData.intake_roles?.length ?? 0) > 0 && !confirm('受注区分を変えると、業務・担当が入れ直されます。よろしいですか？')) return
    const newCat2 = on ? KENIN_COMBO_SECONDARY : ''
    const cats = categoriesOf(caseData.service_category, newCat2)
    const seeded = seedRolesForCategories(cats) as RoleRow[]
    await patchCase({ service_category_2: newCat2 || null, procedure_type: cats, intake_roles: seeded })
  }

  const salesMembers = caseMembers.filter(cm => cm.role === 'sales')
  const managerAssigned = caseMembers.some(cm => cm.role === 'manager')
  const initialTasksDone = isInitialTasksDone(tasks)

  return (
    <div className="space-y-3.5">
      <TabHeader title="面談情報" description="案件・面談・被相続人の基本情報と、面談時に聴取した内容の管理" />

      {/* 面談結果（報告書式の項目をそのまま） */}
      <Section title="面談結果">
        <FieldGrid>
          <InlineEdit label="紹介元" value={caseData.order_route_detail} onSave={v => saveCaseField('order_route_detail', v)} />
          <InlineMemberSelect label="面談担当（受注担当）" roleKey="sales" assigned={salesMembers} allMembers={allMembers} caseId={caseData.id} onRefresh={onRefresh} multi={false} />
          <InlineEdit label="顧客名（依頼者名）" value={caseData.deal_name} onSave={v => saveCaseField('deal_name', v)} />
          <InlineSelect label="面談結果（ステータス）" value={caseData.status} options={getSelectableCaseStatuses(!!caseData.order_sheet_completed_at, caseData.status, managerAssigned, initialTasksDone, contractProcDone)} optionLabel={getCaseStatusLabel} onSave={v => saveCaseField('status', v)} />
          <InlineSelect label="手続内容（受注区分）" value={caseData.service_category} options={[...ORDER_CATEGORIES]} onSave={v => selectCategory(v)} />
          {caseData.service_category === KENIN_CATEGORY && (
            <label className="col-span-2 flex items-center gap-2 cursor-pointer text-[13px] text-gray-700 py-1.5">
              <input type="checkbox" checked={caseData.service_category_2 === KENIN_COMBO_SECONDARY} onChange={e => toggleFull(e.target.checked)} className="w-4 h-4 accent-brand-600" />
              手続き一式へ移行する（検認① → 手続き一式②）
            </label>
          )}
          <InlineSelect label="検討期間" value={caseData.consideration_period} options={[...CONSIDERATION_PERIODS]} onSave={v => selectPeriod(v)} />
          <InlineDate label="お客様回答予定日" value={caseData.client_response_due_date} onSave={v => saveCaseField('client_response_due_date', v || null)} max={considerationDueMax(caseData.consideration_period) ?? undefined} />
          <InlineEdit label="提案金額" value={caseData.proposal_note} onSave={v => saveCaseField('proposal_note', v)} />
          <InlineCheckbox label="LPによる追いかけ可" value={caseData.lp_followup_allowed ?? false} onSave={v => saveCaseField('lp_followup_allowed', v)} />
          <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => saveCaseField('expected_completion_date', v || null)} />
          <InlineSelect label="検討中・不受託理由" value={caseData.consideration_decline_reason} options={[...CONSIDERATION_DECLINE_REASONS]} onSave={v => saveCaseField('consideration_decline_reason', v)} />
          <InlineTextarea label="備考" value={caseData.consideration_decline_reason_detail} onSave={v => saveCaseField('consideration_decline_reason_detail', v)} fullWidth />
          <InlineTextarea label="ヒアリング内容メモ" value={caseData.meeting_hearing_memo} onSave={v => saveCaseField('meeting_hearing_memo', v)} fullWidth placeholder={HEARING_MEMO_SAMPLE} />
        </FieldGrid>
        {/* 不動産売却・税理士などの他事業者紹介（ON＝紹介タブに業者サブタブ作成） */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <ReferralToggles caseId={caseData.id} referrals={referrals} onRefresh={onRefresh} />
          <p className="text-[11px] text-gray-400 mt-1.5">不動産売却・税理士もここでONにし、依頼内容は「他事業者紹介」タブの詳細内容に記載します。</p>
        </div>
      </Section>


      {/* ④ 相談事前情報（LP連携の面談前ヒアリング。LP経由でない案件は空のため既定で閉じる） */}
      <Section title="相談事前情報" collapsible defaultOpen={false}>
        <FieldGrid>
          <InlineTextarea label="ヒアリング内容"      value={caseData.hearing_content} onSave={v => saveCaseField('hearing_content', v)} fullWidth />
          <InlineTextarea label="特記事項（社内のみ）" value={caseData.special_notes}   onSave={v => saveCaseField('special_notes', v)} fullWidth />
          <InlineTextarea label="その他ニーズ"        value={caseData.other_needs}     onSave={v => saveCaseField('other_needs', v)} fullWidth />
          <InlineEdit label="伺い先住所" value={caseData.visit_address} onSave={v => saveCaseField('visit_address', v)} fullWidth />
          <InlineEdit label="伺い先補足" value={caseData.visit_notes}   onSave={v => saveCaseField('visit_notes', v)} fullWidth />
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
