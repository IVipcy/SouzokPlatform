'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Badge from '@/components/ui/Badge'
import {
  ROLES, TASK_STATUSES, CASE_STATUSES,
  LOCATIONS, TEAMS, PROCEDURE_TYPES, ADDITIONAL_SERVICES, TAX_FILING_OPTIONS,
  KOSEKI_REQUEST_REASONS, KOSEKI_REQUEST_PATTERNS, KOSEKI_REQUEST_TYPES,
  ORDER_ROUTES, MAILING_DESTINATIONS, INVESTIGATION_DOCUMENTS,
  WILL_TYPES, WILL_STORAGE_OPTIONS, WILL_EXECUTION_OPTIONS, WILL_CREATION_PLACES,
  TRUST_CONTRACT_TYPES, LIFE_INSURANCE_PROPOSAL_OPTIONS, TAX_ADVISOR_REFERRAL_OPTIONS,
  LOST_REASONS,
} from '@/lib/constants'
import { getPhaseLabel } from '@/lib/phases'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow } from '@/types'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
  allMembers: MemberRow[]
  onRefresh?: () => void
}

export default function OverviewTab({ caseData, caseMembers, tasks, allMembers, onRefresh }: Props) {
  const completedTasks = tasks.filter(t => t.status === '完了').length
  const totalTasks = tasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const saveCaseField = async (field: string, value: unknown) => {
    const supabase = createClient()
    await supabase.from('cases').update({ [field]: value ?? null }).eq('id', caseData.id)
    onRefresh?.()
  }

  const saveCaseFields = async (fields: Record<string, unknown>) => {
    const supabase = createClient()
    await supabase.from('cases').update(fields).eq('id', caseData.id)
    onRefresh?.()
  }

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
            <InlineDate label="完了日" value={caseData.completion_date} onSave={v => saveCaseField('completion_date', v || null)} />
            <InlineDate label="完了予定日" value={caseData.completion_date} onSave={v => saveCaseField('completion_date', v || null)} />
            <InlineSelect label="拠点" value={caseData.location} options={[...LOCATIONS]} onSave={v => saveCaseField('location', v)} required />
            <InlineSelect label="チーム" value={caseData.team} options={[...TEAMS]} onSave={v => saveCaseField('team', v)} />
            <InlineNumber label="確度（%）" value={caseData.probability} onSave={v => saveCaseField('probability', v)} suffix="%" />
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
            <InlineMultiSelect
              label="受注区分"
              value={caseData.order_category}
              options={['手続一式', '登記のみ', '遺言のみ', 'コンサルのみ']}
              onSave={v => saveCaseField('order_category', v)}
              fullWidth
            />
          </FieldGrid>
        </Section>

        {/* 6. 戸籍請求関連 */}
        <Section title="戸籍請求関連" icon="📜">
          <FieldGrid>
            <InlineSelect
              label="戸籍請求理由"
              value={caseData.koseki_request_reason}
              options={[...KOSEKI_REQUEST_REASONS]}
              onSave={v => saveCaseField('koseki_request_reason', v)}
              fullWidth
            />
            <InlineEdit label="戸籍請求理由（その他）" value={caseData.koseki_request_reason_other} onSave={v => saveCaseField('koseki_request_reason_other', v)} fullWidth />
            <InlineSelect
              label="戸籍請求書パターン"
              value={caseData.koseki_request_pattern}
              options={[...KOSEKI_REQUEST_PATTERNS]}
              onSave={v => saveCaseField('koseki_request_pattern', v)}
            />
            <InlineMultiSelect
              label="請求の種別"
              value={caseData.koseki_request_type}
              options={[...KOSEKI_REQUEST_TYPES]}
              onSave={v => saveCaseField('koseki_request_type', v)}
              fullWidth
            />
            <InlineEdit label="使用目的" value={caseData.koseki_purpose} onSave={v => saveCaseField('koseki_purpose', v)} fullWidth />
            <InlineTextarea label="戸籍特記事項" value={caseData.koseki_notes} onSave={v => saveCaseField('koseki_notes', v)} fullWidth />
          </FieldGrid>
        </Section>

        {/* 7. 受注ルート・紹介 */}
        <Section title="受注ルート・紹介" icon="🔗">
          <FieldGrid>
            <InlineSelect label="受注ルート" value={caseData.order_route} options={[...ORDER_ROUTES]} onSave={v => saveCaseField('order_route', v)} />
            <InlineEdit label="受注ルート（LP名）" value={caseData.order_route_lp_name} onSave={v => saveCaseField('order_route_lp_name', v)} />
            <InlineEdit label="受注ルート担当者" value={caseData.order_route_person} onSave={v => saveCaseField('order_route_person', v)} />
            <InlineEdit label="紹介先" value={caseData.referral_name} onSave={v => saveCaseField('referral_name', v)} />
          </FieldGrid>
        </Section>

        {/* 9. 郵送・書類管理 */}
        <Section title="郵送・書類管理" icon="📬">
          <FieldGrid>
            <InlineSelect label="顧客郵送先" value={caseData.mailing_destination} options={[...MAILING_DESTINATIONS]} onSave={v => saveCaseField('mailing_destination', v)} />
            <InlineEdit label="郵送先住所（その他）" value={caseData.mailing_address_other} onSave={v => saveCaseField('mailing_address_other', v)} fullWidth />
            <InlineTextarea label="重要事項" value={caseData.notes} onSave={v => saveCaseField('notes', v)} fullWidth />
            <InlineSelect label="財産調査使用書類" value={caseData.investigation_document} options={[...INVESTIGATION_DOCUMENTS]} onSave={v => saveCaseField('investigation_document', v)} />
          </FieldGrid>
        </Section>

        {/* 13. 相続税申告 */}
        <Section title="相続税申告" icon="💰">
          <FieldGrid>
            <InlineSelect label="相続税申告要否" value={caseData.tax_filing_required} options={[...TAX_FILING_OPTIONS]} onSave={v => saveCaseField('tax_filing_required', v)} />
            <InlineDate label="申告期限" value={caseData.tax_filing_deadline} onSave={v => saveCaseField('tax_filing_deadline', v || null)} />
            <InlineCurrency label="資産合計額（概算）" value={caseData.total_asset_estimate} onSave={v => saveCaseField('total_asset_estimate', v)} />
            <InlineSelect label="税理士紹介有無" value={caseData.tax_advisor_referral} options={[...TAX_ADVISOR_REFERRAL_OPTIONS]} onSave={v => saveCaseField('tax_advisor_referral', v)} />
            <InlineEdit label="税理士名・事務所名" value={caseData.tax_advisor_name} onSave={v => saveCaseField('tax_advisor_name', v)} fullWidth />
          </FieldGrid>
        </Section>

        {/* 14. 遺言関連 */}
        <Section title="遺言関連" icon="📝">
          <FieldGrid>
            <InlineSelect label="遺言種別" value={caseData.will_type} options={[...WILL_TYPES]} onSave={v => saveCaseField('will_type', v)} />
            <InlineSelect label="遺言保管" value={caseData.will_storage} options={[...WILL_STORAGE_OPTIONS]} onSave={v => saveCaseField('will_storage', v)} />
            <InlineSelect label="遺言執行" value={caseData.will_execution} options={[...WILL_EXECUTION_OPTIONS]} onSave={v => saveCaseField('will_execution', v)} />
            <InlineCheckbox label="遺留分リスク" value={caseData.will_remainders_risk} onSave={v => saveCaseField('will_remainders_risk', v)} />
            <InlineCheckbox label="遺贈有無" value={caseData.will_bequest} onSave={v => saveCaseField('will_bequest', v)} />
            <InlineSelect label="作成場所" value={caseData.will_creation_place} options={[...WILL_CREATION_PLACES]} onSave={v => saveCaseField('will_creation_place', v)} />
            <InlineEdit label="公証役場名" value={caseData.notary_office_name} onSave={v => saveCaseField('notary_office_name', v)} />
          </FieldGrid>
        </Section>

        {/* 15. 信託関連 */}
        <Section title="信託関連" icon="🏦">
          <FieldGrid>
            <InlineSelect label="信託契約書種別" value={caseData.trust_contract_type} options={[...TRUST_CONTRACT_TYPES]} onSave={v => saveCaseField('trust_contract_type', v)} />
          </FieldGrid>
        </Section>

        {/* 16. 生命保険提案 */}
        <Section title="生命保険提案" icon="🛡️">
          <FieldGrid>
            <InlineSelect label="生命保険提案有無" value={caseData.life_insurance_proposal} options={[...LIFE_INSURANCE_PROPOSAL_OPTIONS]} onSave={v => saveCaseField('life_insurance_proposal', v)} />
            <InlineEdit label="保険会社名" value={caseData.life_insurance_company} onSave={v => saveCaseField('life_insurance_company', v)} />
            <InlineEdit label="保険種類・金額" value={caseData.life_insurance_type_amount} onSave={v => saveCaseField('life_insurance_type_amount', v)} />
            <InlineCheckbox label="生命保険協会照会" value={caseData.life_insurance_inquiry} onSave={v => saveCaseField('life_insurance_inquiry', v)} />
            <InlineTextarea label="照会結果備考" value={caseData.life_insurance_inquiry_notes} onSave={v => saveCaseField('life_insurance_inquiry_notes', v)} fullWidth />
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

// ─── Section ───
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-3">
        {children}
      </div>
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-0">{children}</div>
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
        {value ?? '未設定'}
      </div>
    </div>
  )
}

function QIRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-b-0 text-xs">
      <span className="text-gray-500">{label}</span>
      {children}
    </div>
  )
}

// ─── InlineEdit (text) ───
function InlineEdit({ label, value, onSave, mono, fullWidth, required }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  mono?: boolean
  fullWidth?: boolean
  required?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleStartEdit = () => { setDraft(value ?? ''); setEditing(true) }

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(trimmed) } finally { setSaving(false); setEditing(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] border border-blue-400 rounded outline-none bg-blue-50/30 ${mono ? 'font-mono' : ''} ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={handleStartEdit} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value ?? '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineSelect (picklist) ───
function InlineSelect({ label, value, options, onSave, fullWidth, required, renderValue }: {
  label: string
  value?: string | null
  options: string[]
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
  renderValue?: (v: string) => React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleChange = async (newVal: string) => {
    if (newVal === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(newVal) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <select
          value={value ?? ''}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          disabled={saving}
          className={`w-full px-1 py-0.5 -ml-1 text-[13px] border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
        >
          <option value="">（未設定）</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <div onClick={() => setEditing(true)} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {value ? (
            renderValue ? renderValue(value) : <span className="text-[13px] text-gray-700 font-medium">{value}</span>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">▼</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineMultiSelect ───
function InlineMultiSelect({ label, value, options, onSave, fullWidth, required }: {
  label: string
  value?: string[] | null
  options: string[]
  onSave: (value: string[]) => Promise<void>
  fullWidth?: boolean
  required?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(value ?? [])
  const [saving, setSaving] = useState(false)

  const toggle = (opt: string) => {
    setDraft(prev => prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt])
  }

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(draft) } finally { setSaving(false); setEditing(false) }
  }

  const handleOpen = () => { setDraft(value ?? []); setEditing(true) }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <div className="mt-1 p-2 border border-blue-400 rounded bg-blue-50/30">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={saving}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                  draft.includes(opt)
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {draft.includes(opt) && '✓ '}{opt}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-[10px] text-gray-400 hover:text-gray-600">キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="text-[10px] text-blue-600 font-semibold hover:text-blue-700">保存</button>
          </div>
        </div>
      ) : (
        <div onClick={handleOpen} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {value && value.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {value.map(item => (
                <span key={item} className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex-shrink-0">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineDate ───
function InlineDate({ label, value, onSave, fullWidth, required }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const handleSave = async () => {
    if (draft === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(draft) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] font-mono border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value ?? '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">📅</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineNumber ───
function InlineNumber({ label, value, onSave, fullWidth, suffix }: {
  label: string
  value?: number | null
  onSave: (value: number | null) => Promise<void>
  fullWidth?: boolean
  suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing])

  const handleSave = async () => {
    const parsed = draft.trim() === '' ? null : Number(draft)
    if (parsed === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(parsed) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value?.toString() ?? ''); setEditing(false) } }}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] font-mono border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `${value.toLocaleString()}${suffix ?? ''}` : '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineCurrency ───
function InlineCurrency({ label, value, onSave, fullWidth }: {
  label: string
  value?: number | null
  onSave: (value: number | null) => Promise<void>
  fullWidth?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing])

  const handleSave = async () => {
    const parsed = draft.trim() === '' ? null : Number(draft.replace(/,/g, ''))
    if (parsed === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(parsed) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-gray-500">¥</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value?.toString() ?? ''); setEditing(false) } }}
            disabled={saving}
            className={`w-full px-1.5 py-0.5 text-[13px] font-mono border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
          />
        </div>
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `¥${value.toLocaleString()}` : '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineCheckbox ───
function InlineCheckbox({ label, value, onSave }: {
  label: string
  value?: boolean
  onSave: (value: boolean) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)

  const handleToggle = async () => {
    setSaving(true)
    try { await onSave(!value) } finally { setSaving(false) }
  }

  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className="flex items-center gap-2 min-h-[24px]">
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
            value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 hover:border-blue-400'
          } ${saving ? 'opacity-50' : ''}`}
        >
          {value && <span className="text-[11px]">✓</span>}
        </button>
        <span className={`text-[13px] ${value ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
          {value ? 'あり' : 'なし'}
        </span>
      </div>
    </div>
  )
}

// ─── InlineTextarea ───
function InlineTextarea({ label, value, onSave, fullWidth }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) textareaRef.current.focus()
  }, [editing])

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(trimmed) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={saving}
            rows={3}
            className={`w-full px-1.5 py-1 -ml-1.5 text-[13px] border border-blue-400 rounded outline-none bg-blue-50/30 resize-y ${saving ? 'opacity-50' : ''}`}
          />
          <div className="flex gap-2 justify-end mt-1">
            <button onClick={() => { setDraft(value ?? ''); setEditing(false) }} className="text-[10px] text-gray-400 hover:text-gray-600">キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="text-[10px] text-blue-600 font-semibold hover:text-blue-700">保存</button>
          </div>
        </div>
      ) : (
        <div onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="group cursor-pointer flex items-start gap-1.5 min-h-[24px]">
          {value ? (
            <span className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{value}</span>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex-shrink-0 mt-0.5">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineMemberSelect (担当者選択) ───
function InlineMemberSelect({ label, roleKey, assigned, allMembers, caseId, onRefresh, multi }: {
  label: string
  roleKey: string
  assigned: CaseMemberRow[]
  allMembers: MemberRow[]
  caseId: string
  onRefresh?: () => void
  multi?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSelect = async (memberId: string) => {
    setSaving(true)
    const supabase = createClient()
    try {
      if (!multi) {
        // Single: remove existing, add new
        await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', roleKey)
        if (memberId) {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
        }
      } else {
        // Multi: toggle
        const existing = assigned.find(cm => cm.member_id === memberId)
        if (existing) {
          await supabase.from('case_members').delete().eq('id', existing.id)
        } else {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
        }
      }
      onRefresh?.()
    } finally {
      setSaving(false)
      if (!multi) setEditing(false)
    }
  }

  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div className="mt-1 p-2 border border-blue-400 rounded bg-blue-50/30">
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {!multi && (
              <button
                onClick={() => handleSelect('')}
                disabled={saving}
                className="w-full text-left px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 rounded"
              >
                （未設定）
              </button>
            )}
            {allMembers.map(member => {
              const isAssigned = assigned.some(cm => cm.member_id === member.id)
              return (
                <button
                  key={member.id}
                  onClick={() => handleSelect(member.id)}
                  disabled={saving}
                  className={`w-full text-left px-2 py-1 text-xs rounded flex items-center gap-2 ${
                    isAssigned ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: member.avatar_color }}
                  >
                    {member.name.charAt(0)}
                  </span>
                  <span>{member.name}</span>
                  {isAssigned && <span className="ml-auto text-blue-500">✓</span>}
                </button>
              )
            })}
          </div>
          <div className="flex justify-end mt-2">
            <button onClick={() => setEditing(false)} className="text-[10px] text-gray-400 hover:text-gray-600">閉じる</button>
          </div>
        </div>
      ) : (
        <div onClick={() => setEditing(true)} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {assigned.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {assigned.map(cm => (
                <div key={cm.member_id} className="flex items-center gap-1.5">
                  <span
                    className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: cm.members?.avatar_color ?? '#6B7280' }}
                  >
                    {cm.members?.name?.charAt(0) ?? '?'}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {cm.members?.name ?? '未設定'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-300 italic">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}
