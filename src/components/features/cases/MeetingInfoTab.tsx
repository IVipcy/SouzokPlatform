'use client'

import Badge from '@/components/ui/Badge'
import {
  Section, FieldGrid, QIRow, InlineEdit, InlineSelect, InlineMultiSelect,
  InlineDate, InlineMemberSelect, InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  ROLES, PROCEDURE_TYPES, ADDITIONAL_SERVICES,
  ORDER_ROUTES, ORDER_ROUTE_DETAILS, LOST_REASONS, MEETING_PLACES,
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
 * 案件進捗タブの「基本情報」セクション以外（面談内容・相談情報・担当者・
 * 受注内容・受注ルート・収益・クイック情報）をまとめて表示・編集する。
 */
export default function MeetingInfoTab({ caseData, caseMembers, allMembers, onRefresh, patchCase }: Props) {
  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Left column */}
      <div className="space-y-3.5">
        {/* 面談内容 */}
        <Section title="面談内容" icon="🤝">
          <FieldGrid>
            <InlineDate label="面談予定日"      value={caseData.meeting_date}             onSave={v => saveCaseField('meeting_date', v || null)} />
            <InlineDate label="面談実施日"      value={caseData.meeting_executed_date}    onSave={v => saveCaseField('meeting_executed_date', v || null)} />
            <InlineSelect label="面談場所"      value={caseData.meeting_place}            options={[...MEETING_PLACES]} onSave={v => saveCaseField('meeting_place', v)} />
            <InlineDate label="お客様回答予定日" value={caseData.client_response_due_date} onSave={v => saveCaseField('client_response_due_date', v || null)} required />
            <InlineSelect label="失注の理由"    value={caseData.lost_reason}              options={[...LOST_REASONS]} onSave={v => saveCaseField('lost_reason', v)} />
            <InlineEdit label="伺い先住所"      value={caseData.visit_address}            onSave={v => saveCaseField('visit_address', v)} fullWidth />
            <InlineEdit label="伺い先補足"      value={caseData.visit_notes}              onSave={v => saveCaseField('visit_notes', v)} fullWidth />
          </FieldGrid>
        </Section>

        {/* 相談情報（相続ステーション連携で受信） */}
        <Section title="相談情報" icon="💬">
          <FieldGrid>
            <InlineTextarea label="ヒアリング内容"        value={caseData.hearing_content} onSave={v => saveCaseField('hearing_content', v)} fullWidth />
            <InlineTextarea label="特記事項（社内のみ）"   value={caseData.special_notes}   onSave={v => saveCaseField('special_notes', v)} fullWidth />
            <InlineTextarea label="その他ニーズ"          value={caseData.other_needs}     onSave={v => saveCaseField('other_needs', v)} fullWidth />
          </FieldGrid>
        </Section>

        {/* 担当者 */}
        <Section title="担当者" icon="👥">
          <FieldGrid>
            {ROLES.map(role => {
              const assigned = caseMembers.filter(cm => cm.role === role.key)
              return (
                <InlineMemberSelect
                  key={role.key}
                  label={role.label}
                  roleKey={role.key}
                  assigned={assigned}
                  allMembers={allMembers}
                  caseId={caseData.id}
                  onRefresh={onRefresh}
                  multi={false}
                />
              )
            })}
          </FieldGrid>
        </Section>

        {/* 受注内容 */}
        <Section title="受注内容" icon="📦">
          <FieldGrid>
            <InlineMultiSelect
              label="手続区分"
              value={caseData.procedure_type}
              options={[...PROCEDURE_TYPES]}
              onSave={v => saveCaseField('procedure_type', v)}
              fullWidth
              required
            />
            <InlineEdit label="その他手続" value={caseData.other_procedure} onSave={v => saveCaseField('other_procedure', v)} />
            <InlineMultiSelect
              label="付帯サービス"
              value={caseData.additional_services}
              options={[...ADDITIONAL_SERVICES]}
              onSave={v => saveCaseField('additional_services', v)}
              fullWidth
            />
          </FieldGrid>
        </Section>

        {/* 受注ルート・紹介 */}
        <Section title="受注ルート・紹介" icon="🔗">
          <FieldGrid>
            <InlineSelect
              label="受注ルート"
              value={caseData.order_route}
              options={[...ORDER_ROUTES]}
              onSave={async v => {
                await patchCase({ order_route: v, order_route_detail: null })
              }}
            />
            {/* 自社・LP直・オーシャン直 → 詳細受注ルート選択 */}
            {caseData.order_route && ORDER_ROUTE_DETAILS[caseData.order_route] && (
              <InlineSelect
                label="詳細受注ルート"
                value={caseData.order_route_detail}
                options={ORDER_ROUTE_DETAILS[caseData.order_route] as string[]}
                onSave={v => saveCaseField('order_route_detail', v)}
              />
            )}
            {/* その他 → パートナー選択（検索付き） */}
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

      {/* Right column */}
      <div className="space-y-3.5">
        {/* Revenue card */}
        <RevenueCard caseData={caseData} />

        {/* Quick info */}
        <Section title="クイック情報" icon="ℹ️">
          <div className="space-y-0">
            <QIRow label="資産概算">
              <span className="font-mono font-medium text-gray-700">
                {caseData.total_asset_estimate ? `¥${caseData.total_asset_estimate.toLocaleString()}` : '未設定'}
              </span>
            </QIRow>
            <QIRow label="相続税申告">
              {caseData.tax_filing_required ? (
                <Badge
                  label={caseData.tax_filing_required}
                  color={caseData.tax_filing_required === '要' ? '#DC2626' : caseData.tax_filing_required === '不要' ? '#059669' : '#D97706'}
                />
              ) : (
                <span className="text-gray-400">未設定</span>
              )}
            </QIRow>
            <QIRow label="申告期限">
              <span className={`font-mono ${caseData.tax_filing_deadline ? 'text-amber-600' : 'text-gray-400'}`}>
                {caseData.tax_filing_deadline ?? '未設定'}
              </span>
            </QIRow>
            <QIRow label="被相続人">
              <span className="font-medium text-gray-700">{caseData.deceased_name ?? '未設定'}</span>
            </QIRow>
            <QIRow label="相続開始日">
              <span className="font-mono text-gray-700">{caseData.date_of_death ?? '未設定'}</span>
            </QIRow>
            <QIRow label="拠点">
              <span className="text-gray-700">{caseData.location ?? '未設定'}</span>
            </QIRow>
            <QIRow label="確度">
              <span className="font-mono text-gray-700">{caseData.probability != null ? `${caseData.probability}%` : '未設定'}</span>
            </QIRow>
          </div>
        </Section>
      </div>
    </div>
  )
}

// ─── Revenue Card ───
function RevenueCard({ caseData }: { caseData: CaseRow }) {
  const estimate = caseData.total_asset_estimate ?? 0
  const hasRevenue = estimate > 0

  if (!hasRevenue) return null

  return (
    <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
      <div className="text-[12px] font-semibold opacity-70 tracking-wider uppercase mb-1.5">案件収益見込み</div>
      <div className="text-[26px] font-extrabold tracking-tight mb-2.5">
        ¥{estimate.toLocaleString()}
      </div>
      <div className="space-y-1 text-[13px]">
        <div className="flex justify-between">
          <span className="opacity-70">資産概算</span>
          <span className="font-mono">¥{estimate.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
