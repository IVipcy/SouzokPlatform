'use client'

import Badge from '@/components/ui/Badge'
import { ROLES, TASK_STATUSES, CASE_STATUSES } from '@/lib/constants'
import { getPhaseLabel } from '@/lib/phases'
import type { CaseRow, CaseMemberRow, TaskRow } from '@/types'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
}

export default function OverviewTab({ caseData, caseMembers, tasks }: Props) {
  const completedTasks = tasks.filter(t => t.status === '完了').length
  const totalTasks = tasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Left column */}
      <div className="space-y-3.5">
        {/* Basic info */}
        <Section title="基本情報" icon="📋">
          <FieldGrid>
            <Field label="管理番号" value={caseData.case_number} mono />
            <Field label="依頼日" value={caseData.order_date} mono />
            <Field label="完了予定日" value={caseData.completion_date} mono />
            <Field label="難易度" value={caseData.difficulty} />
            <Field label="手続区分">
              <TagList items={caseData.procedure_type} color="blue" />
            </Field>
            <Field label="付帯サービス">
              <TagList items={caseData.additional_services} color="amber" />
            </Field>
            <Field label="相続税申告" value={caseData.tax_filing_required} />
            <Field label="申告期限" value={caseData.tax_filing_deadline} mono />
          </FieldGrid>
        </Section>

        {/* Assignees */}
        <Section title="担当者" icon="👥">
          <FieldGrid>
            {ROLES.map(role => {
              const assigned = caseMembers.filter(cm => cm.role === role.key)
              return (
                <div key={role.key} className="py-1.5 border-b border-gray-50">
                  <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{role.label}</div>
                  {assigned.length > 0 ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
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
                    <div className="text-xs text-gray-300 italic mt-0.5">未設定</div>
                  )}
                </div>
              )
            })}
          </FieldGrid>
        </Section>

        {/* Notes */}
        {caseData.notes && (
          <Section title="重要事項" icon="⚠️">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
              {caseData.notes}
            </div>
          </Section>
        )}
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
  // TODO: billing data from DB. For now show estimate from total_asset_estimate
  const estimate = caseData.total_asset_estimate ?? 0
  // Simple placeholder revenue calculation
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

// ─── Sub components ───
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

function Field({ label, value, mono, children }: { label: string; value?: string | null; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {children ?? (
        <div className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
          {value ?? '未設定'}
        </div>
      )}
    </div>
  )
}

function TagList({ items, color }: { items?: string[] | null; color: 'blue' | 'amber' | 'green' }) {
  if (!items || items.length === 0) return <div className="text-xs text-gray-300 italic">未設定</div>

  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  }

  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {items.map(item => (
        <span key={item} className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${colorMap[color]}`}>
          {item}
        </span>
      ))}
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
