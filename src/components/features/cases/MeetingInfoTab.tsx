'use client'

import {
  Section, FieldGrid, Field, InlineEdit, InlineSelect, InlineMultiSelect,
  InlineDate, InlineMemberSelect, InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  PROCEDURE_TYPES, ADDITIONAL_SERVICES,
  ORDER_ROUTES, ORDER_ROUTE_DETAILS, LOST_REASONS, MEETING_PLACES,
  MEETING_SELECTABLE_STATUSES, getCaseStatusLabel,
} from '@/lib/constants'
import type { CaseRow, CaseMemberRow, MemberRow } from '@/types'
import PartnerManagerField from './PartnerManagerField'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  allMembers: MemberRow[]
  onRefresh?: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 面談情報タブ
 * 案件作成（面談）時に登録する情報を、面談に特化した4セクションで表示・編集する。
 *   ① 案件情報   : 案件管理番号 / 受注担当 / 案件ステータス / 案件作成日
 *   ② 面談概要   : 面談予定日 / 面談実施日 / 面談場所 / お客様回答予定日 / 伺い先
 *   ③ 面談内容   : ヒアリング内容メモ / 受注見込み手続き区分 / 失注理由 / その他備考
 *   ④ 相談事前情報: LP担当が面談前にヒアリングした事前情報（アコーディオン・既定で閉じる）
 * ＋ 受注・その他情報（管理担当・受注ルート等。受託時にオーダーシートへ移行予定。既定で閉じる）
 *
 * ※ 他事業者紹介要否（税理士/弁護士/不動産/遺品整理）は「他事業者紹介」タブで管理（Phase 3）。
 */
export default function MeetingInfoTab({ caseData, caseMembers, allMembers, onRefresh, patchCase }: Props) {
  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  const salesMembers = caseMembers.filter(cm => cm.role === 'sales')
  const managerMembers = caseMembers.filter(cm => cm.role === 'manager')
  const subManagerMembers = caseMembers.filter(cm => cm.role === 'sub_manager')

  return (
    <div className="max-w-3xl space-y-3.5">
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
            options={[...MEETING_SELECTABLE_STATUSES]}
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
          <InlineSelect label="失注理由" value={caseData.lost_reason} options={[...LOST_REASONS]} onSave={v => saveCaseField('lost_reason', v)} />
          <InlineTextarea label="その他備考" value={caseData.meeting_other_notes} onSave={v => saveCaseField('meeting_other_notes', v)} fullWidth />
        </FieldGrid>
        <p className="text-[11px] text-gray-400 mt-2">
          ※ 他事業者紹介（税理士・弁護士・不動産・遺品整理）は「他事業者紹介」タブで管理します。
        </p>
      </Section>

      {/* ④ 相談事前情報（LP連携の面談前ヒアリング。LP経由でない案件は空のため既定で閉じる） */}
      <Section title="相談事前情報" collapsible defaultOpen={false}>
        <FieldGrid>
          <InlineTextarea label="ヒアリング内容"      value={caseData.hearing_content} onSave={v => saveCaseField('hearing_content', v)} fullWidth />
          <InlineTextarea label="特記事項（社内のみ）" value={caseData.special_notes}   onSave={v => saveCaseField('special_notes', v)} fullWidth />
          <InlineTextarea label="その他ニーズ"        value={caseData.other_needs}     onSave={v => saveCaseField('other_needs', v)} fullWidth />
        </FieldGrid>
      </Section>

      {/* 受注・その他情報（受託時にオーダーシートへ移行予定。既定で閉じる） */}
      <Section title="受注・その他情報" collapsible defaultOpen={false}>
        <FieldGrid>
          <InlineMemberSelect
            label="管理担当"
            roleKey="manager"
            assigned={managerMembers}
            allMembers={allMembers}
            caseId={caseData.id}
            onRefresh={onRefresh}
            multi={false}
          />
          <InlineMemberSelect
            label="サブ管理担当"
            roleKey="sub_manager"
            assigned={subManagerMembers}
            allMembers={allMembers}
            caseId={caseData.id}
            onRefresh={onRefresh}
            multi={false}
          />
          <InlineEdit label="その他手続" value={caseData.other_procedure} onSave={v => saveCaseField('other_procedure', v)} />
          <InlineMultiSelect
            label="付帯サービス"
            value={caseData.additional_services}
            options={[...ADDITIONAL_SERVICES]}
            onSave={v => saveCaseField('additional_services', v)}
            fullWidth
          />
          <InlineSelect
            label="受注ルート"
            value={caseData.order_route}
            options={[...ORDER_ROUTES]}
            onSave={async v => { await patchCase({ order_route: v, order_route_detail: null }) }}
          />
          {caseData.order_route && ORDER_ROUTE_DETAILS[caseData.order_route] && (
            <InlineSelect
              label="詳細受注ルート"
              value={caseData.order_route_detail}
              options={ORDER_ROUTE_DETAILS[caseData.order_route] as string[]}
              onSave={v => saveCaseField('order_route_detail', v)}
            />
          )}
          {caseData.order_route === 'その他' && (
            <PartnerManagerField
              caseId={caseData.id}
              partnerId={caseData.partner_id}
              onChange={() => onRefresh?.()}
              label="パートナー名"
            />
          )}
          <InlineEdit label="紹介先名" value={caseData.referral_name} onSave={v => saveCaseField('referral_name', v)} />
        </FieldGrid>
      </Section>
    </div>
  )
}
