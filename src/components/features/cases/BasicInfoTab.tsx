'use client'

import Badge from '@/components/ui/Badge'
import {
  Section, FieldGrid, Field, QIRow, InlineEdit, InlineSelect, InlineMultiSelect,
  InlineDate, InlineNumber, InlineMemberSelect, InlineCheckbox,
} from '@/components/ui/InlineFields'
import {
  ROLES, TASK_STATUSES, CASE_STATUSES,
  LOCATIONS, TEAMS, PROCEDURE_TYPES, ADDITIONAL_SERVICES,
  ORDER_ROUTES, LOST_REASONS,
} from '@/lib/constants'
import { getPhaseLabel } from '@/lib/phases'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow } from '@/types'
import PartnerManagerField from './PartnerManagerField'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
  allMembers: MemberRow[]
  onRefresh?: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
}

export default function BasicInfoTab({ caseData, caseMembers, tasks, allMembers, onRefresh, patchCase, patchClient }: Props) {
  const completedTasks = tasks.filter(t => t.status === '完了').length
  const totalTasks = tasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  const saveClientField = async (field: string, value: unknown) => {
    await patchClient({ [field]: value ?? null })
  }

  const client = caseData.clients

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Left column */}
      <div className="space-y-3.5">
        {/* 1. 基本情報 */}
        <Section title="基本情報" icon="📋">
          <FieldGrid>
            <InlineEdit label="案件名" value={caseData.deal_name} onSave={v => saveCaseField('deal_name', v)} fullWidth />
            <Field label="管理番号" value={caseData.case_number} mono />
            <InlineSelect
              label="案件ステータス"
              value={caseData.status}
              options={CASE_STATUSES.map(s => s.key)}
              onSave={v => saveCaseField('status', v)}
              renderValue={v => {
                const s = CASE_STATUSES.find(cs => cs.key === v)
                return s ? <Badge label={v} color={s.color} /> : v
              }}
            />
            <InlineDate label="依頼日" value={caseData.order_date} onSave={v => saveCaseField('order_date', v || null)} required />
            <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => saveCaseField('expected_completion_date', v || null)} />
            <Field label="完了日" value={caseData.completion_date ?? '未完了'} mono />
            <InlineSelect label="拠点" value={caseData.location} options={[...LOCATIONS]} onSave={v => saveCaseField('location', v)} required />
            <InlineSelect label="チーム" value={caseData.team} options={[...TEAMS]} onSave={v => saveCaseField('team', v)} />
            <InlineSelect
              label="確度"
              value={caseData.probability != null ? String(caseData.probability) : null}
              options={['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100']}
              onSave={v => saveCaseField('probability', v != null ? Number(v) : null)}
              renderValue={v => v != null ? `${v}%` : ''}
            />
            <InlineDate label="面談予定日" value={caseData.meeting_date} onSave={v => saveCaseField('meeting_date', v || null)} />
            <InlineDate label="受注日" value={caseData.order_received_date} onSave={v => saveCaseField('order_received_date', v || null)} />
            <InlineSelect label="失注の理由" value={caseData.lost_reason} options={[...LOST_REASONS]} onSave={v => saveCaseField('lost_reason', v)} />
          </FieldGrid>
        </Section>

        {/* 2. 担当者 */}
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

        {/* 3. 依頼者情報 */}
        <Section title="依頼者情報" icon="👤">
          {caseData.client_id && client ? (
            <FieldGrid>
              <InlineEdit label="依頼者氏名" value={client.name} onSave={v => saveClientField('name', v)} required />
              <InlineEdit label="依頼者ふりがな" value={client.furigana} onSave={v => saveClientField('furigana', v)} />
              <InlineEdit label="依頼者住所" value={client.address} onSave={v => saveClientField('address', v)} fullWidth required />
              <InlineEdit label="依頼者TEL" value={client.phone} onSave={v => saveClientField('phone', v)} />
              <InlineEdit label="依頼者携帯TEL" value={client.mobile_phone} onSave={v => saveClientField('mobile_phone', v)} />
              <InlineEdit label="依頼者メール" value={client.email} onSave={v => saveClientField('email', v)} />
              <InlineMultiSelect
                label="連絡先希望"
                value={client.preferred_contact}
                options={['自宅TEL', '携帯TEL', 'メール']}
                onSave={v => saveClientField('preferred_contact', v)}
              />
              <InlineCheckbox label="依頼者外字有無" value={client.has_special_chars} onSave={v => saveClientField('has_special_chars', v)} />
            </FieldGrid>
          ) : (
            <p className="text-sm text-gray-400 italic py-2">依頼者未登録</p>
          )}
        </Section>

        {/* 5. 受注内容 */}
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

        {/* 7. 受注ルート・紹介 */}
        <Section title="受注ルート・紹介" icon="🔗">
          <FieldGrid>
            <InlineSelect label="受注ルート" value={caseData.order_route} options={[...ORDER_ROUTES]} onSave={v => saveCaseField('order_route', v)} />
            {caseData.order_route === 'LP' && (
              <InlineEdit label="受注ルート（LP担当者名）" value={caseData.order_route_lp_name} onSave={v => saveCaseField('order_route_lp_name', v)} />
            )}
            {caseData.order_route === 'その他' && (
              <>
                <PartnerManagerField
                  caseId={caseData.id}
                  partnerId={caseData.partner_id}
                  onChange={() => onRefresh?.()}
                  label="パートナー名"
                />
                <InlineEdit label="受注ルート（パートナー担当者名）" value={caseData.order_route_person} onSave={v => saveCaseField('order_route_person', v)} />
              </>
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
            <QIRow label="不動産ランク">
              {caseData.property_rank && caseData.property_rank !== '確認中' ? (
                <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded font-extrabold text-sm">
                  {caseData.property_rank}
                </span>
              ) : (
                <span className="text-gray-400">{caseData.property_rank ?? '未設定'}</span>
              )}
            </QIRow>
            <QIRow label="拠点">
              <span className="text-gray-700">{caseData.location ?? '未設定'}</span>
            </QIRow>
            <QIRow label="確度">
              <span className="font-mono text-gray-700">{caseData.probability != null ? `${caseData.probability}%` : '未設定'}</span>
            </QIRow>
          </div>
        </Section>

        {/* Task progress */}
        <Section title="タスク進捗" icon="✅">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-500">完了 {completedTasks} / {totalTasks}タスク</span>
            <span className="font-semibold">{progressPct}%</span>
          </div>
          <div className="w-full h-[5px] bg-gray-200 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="space-y-1">
            {tasks.slice(0, 5).map(task => {
              const statusDef = TASK_STATUSES.find(s => s.key === task.status)
              return (
                <div key={task.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: statusDef?.color ?? '#6B7280' }}
                  />
                  <span className={`flex-1 truncate ${task.status === '完了' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {task.title}
                  </span>
                  <span className="text-gray-400 font-mono text-[10px]">{getPhaseLabel(task.phase)}</span>
                </div>
              )
            })}
            {tasks.length > 5 && (
              <p className="text-[10px] text-gray-400">他 {tasks.length - 5} タスク</p>
            )}
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
      <div className="text-[10px] font-semibold opacity-70 tracking-wider uppercase mb-1.5">案件収益見込み</div>
      <div className="text-[26px] font-extrabold tracking-tight mb-2.5">
        ¥{estimate.toLocaleString()}
      </div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="opacity-70">資産概算</span>
          <span className="font-mono">¥{estimate.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">不動産ランク</span>
          <span className="font-mono">{caseData.property_rank ?? '—'}</span>
        </div>
      </div>
    </div>
  )
}
