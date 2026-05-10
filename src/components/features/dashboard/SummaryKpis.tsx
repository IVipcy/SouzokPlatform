import { formatMan, type MetricsBundle } from '@/lib/dashboardMetrics'

type Props = {
  monthLabel: string
  metrics: MetricsBundle
}

const KPI_DEFS = [
  { key: 'newOrders', label: '新規受注案件', desc: '今月新たに受注した案件の総数をカウント', unit: '件/月' },
  { key: 'managing', label: '管理案件', desc: '業務完了がしておらず、現在進行中の案件 / 新規受注案件も含む', unit: '件/月' },
  { key: 'completed', label: '完了案件', desc: '今月業務完了した案件の総数をカウント', unit: '件/月' },
  { key: 'cycleMonths', label: 'サイクル', desc: '今月業務完了した案件が受注してから業務完了するまでにかかった期間の平均', unit: 'カ月' },
  { key: 'completedAmount', label: '業務完了金額', desc: '今月業務完了した案件の確定売上の総計', unit: '万円/月' },
] as const

export default function SummaryKpis({ monthLabel, metrics }: Props) {
  const valueOf = (key: typeof KPI_DEFS[number]['key']): string => {
    if (key === 'cycleMonths') {
      return metrics.cycleMonths === null ? '-' : metrics.cycleMonths.toFixed(1)
    }
    if (key === 'completedAmount') {
      return formatMan(metrics.completedAmount)
    }
    return String(metrics[key])
  }

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900">相続事業部 {monthLabel}</h2>
        <span className="text-[13px] text-gray-500 px-2 py-0.5 bg-gray-100 rounded">当月の部全体の数値</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPI_DEFS.map(def => (
          <div key={def.key} className="bg-white border border-gray-300 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-center">
              <div className="text-[14px] font-semibold text-gray-700">{def.label}</div>
            </div>
            <div className="px-3 py-4 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-[28px] font-extrabold leading-none text-gray-900 tracking-tight">
                  {valueOf(def.key)}
                </span>
                <span className="text-[13px] font-bold text-gray-500">{def.unit}</span>
              </div>
            </div>
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-[14px] leading-snug text-gray-500">{def.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
