'use client'

import { useMemo } from 'react'
import type { CaseRow, MemberRow, CaseMemberRow } from '@/types'

type InvoiceData = {
  id: string
  case_id: string
  amount: number
  status: string
  invoice_type: string
  issued_date: string | null
  payments?: { amount: number }[]
}

type CaseData = CaseRow & {
  case_members?: (CaseMemberRow & { members?: MemberRow })[]
}

type Props = {
  cases: CaseData[]
  members: MemberRow[]
  invoices: InvoiceData[]
}

const PIPELINE_STATUSES = ['架電案件化', '面談設定済', '検討中', '受注', '対応中', '完了']
const PIPELINE_COLORS: Record<string, string> = {
  '架電案件化': '#9CA3AF', '面談設定済': '#3B82F6', '検討中': '#D97706',
  '受注': '#16A34A', '対応中': '#7C3AED', '完了': '#059669',
}

function fmt(n: number) { return '¥' + Math.round(n / 10000) + '万' }
function fmtFull(n: number) { return '¥' + n.toLocaleString() }

export default function ReportsClient({ cases, members, invoices }: Props) {
  // Compute revenue from invoices with status 入金済
  const totalRevenue = useMemo(() => {
    return invoices
      .filter(inv => inv.status === '入金済')
      .reduce((sum, inv) => sum + (inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0), 0)
  }, [invoices])

  const totalCases = cases.length
  const activeCases = cases.filter(c => ['受注', '対応中'].includes(c.status)).length
  const completedCases = cases.filter(c => c.status === '完了').length

  // Pipeline
  const pipeline = useMemo(() => {
    return PIPELINE_STATUSES.map(status => ({
      label: status,
      count: cases.filter(c => c.status === status).length,
      color: PIPELINE_COLORS[status] || '#9CA3AF',
      amt: cases.filter(c => c.status === status).reduce((s, c) => s + (c.total_asset_estimate ?? 0), 0),
    }))
  }, [cases])

  const maxPipeline = useMemo(() => Math.max(...pipeline.map(p => p.count), 1), [pipeline])

  // Staff performance
  const staffPerf = useMemo(() => {
    const map = new Map<string, { name: string; color: string; cases: number; revenue: number }>()
    cases.forEach(c => {
      const salesMember = c.case_members?.find(cm => cm.role === 'sales')?.members
      if (!salesMember) return
      const existing = map.get(salesMember.id) || { name: salesMember.name, color: salesMember.avatar_color, cases: 0, revenue: 0 }
      existing.cases++
      existing.revenue += c.total_asset_estimate ?? 0
      map.set(salesMember.id, existing)
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  }, [cases])

  // If no data, show empty-aware UI
  const hasData = cases.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">レポート</h1>
          <p className="text-xs text-gray-400">売上・案件・パフォーマンス分析</p>
        </div>
        <button className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
          📥 CSV出力
        </button>
      </div>

      {!hasData ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="text-4xl opacity-30 mb-3">📊</div>
          <div className="text-sm text-gray-400">レポートデータがありません</div>
          <div className="text-[11px] text-gray-300 mt-1">案件を登録するとレポートが表示されます</div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <KpiCard icon="💴" iconBg="#EFF4FF" label="売上合計（入金済）" value={totalRevenue > 0 ? fmt(totalRevenue) : '—'} />
            <KpiCard icon="📋" iconBg="#ECFDF5" label="総案件数" value={`${totalCases}件`} valueColor="text-green-600" />
            <KpiCard icon="⚡" iconBg="#F5F3FF" label="対応中" value={`${activeCases}件`} valueColor="text-purple-600" />
            <KpiCard icon="✅" iconBg="#F0FDF4" label="完了" value={`${completedCases}件`} valueColor="text-green-600" />
          </div>

          {/* Pipeline */}
          <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4">
            <Card title="🎯 案件パイプライン">
              <div className="space-y-2">
                {pipeline.map(p => (
                  <div key={p.label} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-20 text-right flex-shrink-0">{p.label}</span>
                    <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-full rounded flex items-center justify-end pr-2 text-[10px] font-semibold text-white min-w-[28px]"
                        style={{ width: `${(p.count / maxPipeline) * 100}%`, background: p.color }}
                      >
                        {p.count}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 w-16 text-right flex-shrink-0">{p.amt > 0 ? fmt(p.amt) : ''}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="👥 担当者パフォーマンス">
              {staffPerf.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">担当者データなし</div>
              ) : (
                <div className="space-y-3">
                  {staffPerf.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-extrabold" style={{
                        background: i === 0 ? '#FEF3C7' : i === 1 ? '#F3F4F6' : '#F9FAFB',
                        color: i === 0 ? '#D97706' : '#9CA3AF'
                      }}>
                        {i + 1}
                      </div>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: s.color }}>
                        {s.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900">{s.name}</div>
                        <div className="text-[10px] text-gray-400">{s.cases}件 · {fmtFull(s.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </div>
  )
}

function KpiCard({ icon, iconBg, label, value, valueColor = '' }: {
  icon: string; iconBg: string; label: string; value: string; valueColor?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base mb-2.5" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="text-[11px] font-semibold text-gray-500 mb-1">{label}</div>
      <div className={`text-[26px] font-extrabold tracking-tight leading-none ${valueColor}`}>{value}</div>
    </div>
  )
}
