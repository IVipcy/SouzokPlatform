import { formatMan, type SalesDailyMetricsBundle } from '@/lib/dashboardMetrics'

type Props = {
  scopeLabel: string  // 例: "高橋チーム" or "高橋健一"
  metrics: SalesDailyMetricsBundle
}

const KPIS = [
  { key: 'meetings',  label: '本日面談数',       unit: '件/日' },
  { key: 'newOrders', label: '本日新規受注件数', unit: '件/日' },
  { key: 'conv',      label: '本日受注率',       unit: '%' },
  { key: 'avgUnit',   label: '本日平均受注単価', unit: '万円/件' },
  { key: 'taxFiling', label: '本日 相続税申告', unit: '件/日' },
  { key: 'appraisal', label: '本日 不動産査定', unit: '件/日' },
] as const

function valueOf(key: typeof KPIS[number]['key'], m: SalesDailyMetricsBundle): string {
  switch (key) {
    case 'meetings':  return String(m.meetingsCount)
    case 'newOrders': return String(m.newOrdersCount)
    case 'conv':      return m.conversionRate === null ? '-' : `${Math.round(m.conversionRate * 100)}`
    case 'avgUnit':   return m.avgOrderUnit === null ? '-' : formatMan(m.avgOrderUnit)
    case 'taxFiling': return String(m.taxFilingCount)
    case 'appraisal': return String(m.propertyAppraisalCount)
  }
}

export default function SalesDailyKpis({ scopeLabel, metrics }: Props) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-bold text-gray-900">受注担当 {scopeLabel} 本日</h2>
        <span className="text-[12px] text-gray-500 px-2 py-0.5 bg-gray-100 rounded">本日の動き</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPIS.map(k => (
          <div key={k.key} className="bg-white border border-gray-300 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-center">
              <div className="text-[13px] font-semibold text-gray-700">{k.label}</div>
            </div>
            <div className="px-3 py-4 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-[26px] font-extrabold leading-none text-gray-900 tracking-tight">
                  {valueOf(k.key, metrics)}
                </span>
                <span className="text-[13px] font-bold text-gray-500">{k.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
