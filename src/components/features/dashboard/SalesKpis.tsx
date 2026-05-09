import { formatMan, type SalesMetricsBundle } from '@/lib/dashboardMetrics'

type Props = {
  monthLabel: string
  metrics: SalesMetricsBundle
}

const KPI_DEFS = [
  { key: 'meetingsCount',       label: '当月面談数',       unit: '件/月',  desc: '今月「面談設定済」から検討中/受注/失注/保留・長期 に遷移した案件数' },
  { key: 'newOrdersCount',      label: '当月新規受注件数', unit: '件/月',  desc: 'ステータスが面談設定済から受注になった案件' },
  { key: 'conversionRate',      label: '受注率',           unit: '%',      desc: '当月新規受注件数 ÷ 当月面談数' },
  { key: 'avgOrderUnit',        label: '平均受注単価',     unit: '万円/件', desc: '当月新規受注した案件の業務金額の平均' },
  { key: 'expectedCompletions', label: '業務完了予定件数', unit: '件/月',  desc: '完了予定日が今月の案件数' },
  { key: 'completedCount',      label: '業務完了件数',     unit: '件/月',  desc: '今月業務完了した案件数' },
  { key: 'completedAmount',     label: '業務完了金額',     unit: '万円/月', desc: '今月業務完了した案件の確定売上の総計' },
  { key: 'avgCycleMonths',      label: '平均サイクル',     unit: 'カ月/件', desc: '今月業務完了した案件が受注してから業務完了するまでにかかった期間の平均' },
] as const

function valueOf(key: typeof KPI_DEFS[number]['key'], m: SalesMetricsBundle): string {
  switch (key) {
    case 'meetingsCount':
    case 'newOrdersCount':
    case 'expectedCompletions':
    case 'completedCount':
      return String(m[key])
    case 'conversionRate':
      return m.conversionRate === null ? '-' : `${Math.round(m.conversionRate * 100)}`
    case 'avgOrderUnit':
      return m.avgOrderUnit === null ? '-' : formatMan(m.avgOrderUnit)
    case 'completedAmount':
      return formatMan(m.completedAmount)
    case 'avgCycleMonths':
      return m.avgCycleMonths === null ? '-' : m.avgCycleMonths.toFixed(1)
  }
}

export default function SalesKpis({ monthLabel, metrics }: Props) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900">受注担当 {monthLabel}</h2>
        <span className="text-[11px] text-gray-500 px-2 py-0.5 bg-gray-100 rounded">当月の受注担当の数値</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {KPI_DEFS.map(def => (
          <div key={def.key} className="bg-white border border-gray-300 rounded-xl overflow-hidden">
            <div className="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center">
              <div className="text-[11px] font-semibold text-gray-700">{def.label}</div>
            </div>
            <div className="px-2 py-3 text-center">
              <div className="flex items-baseline justify-center gap-0.5">
                <span className="text-[22px] font-extrabold leading-none text-gray-900 tracking-tight">
                  {valueOf(def.key, metrics)}
                </span>
                <span className="text-[10px] font-bold text-gray-500">{def.unit}</span>
              </div>
            </div>
            <div className="px-2 py-2 bg-gray-50 border-t border-gray-100 min-h-[42px]">
              <p className="text-[9px] leading-snug text-gray-500">{def.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
