import { formatMan, type DailyMetricsBundle } from '@/lib/dashboardMetrics'

type Props = {
  scopeLabel: string  // 例: "相続事業部" or "高橋チーム"
  metrics: DailyMetricsBundle
}

export default function DailyKpis({ scopeLabel, metrics }: Props) {
  const ratio = metrics.monthExpected > 0
    ? `${metrics.monthCompleted}/${metrics.monthExpected}`
    : `${metrics.monthCompleted}/-`

  const KPIS = [
    { label: '新規受注案件', value: String(metrics.newOrders),       unit: '件/日',   desc: '本日新たに受注した案件の総数をカウント' },
    { label: '管理案件',     value: String(metrics.startedManaging), unit: '件/日',   desc: '本日 受注 → 対応中 にステータスが変化した案件（タスク設計が終わって業務開始）' },
    { label: '完了案件',     value: String(metrics.completed),       unit: '件/日',   desc: '本日業務完了した案件の総数をカウント' },
    { label: '完了割合',     value: ratio,                           unit: '件',      desc: '当月業務完了予定の案件数に対して、本日時点でどれくらい完了しているかの割合' },
    { label: '業務完了金額', value: formatMan(metrics.completedAmount), unit: '万円/日', desc: '本日業務完了した案件の確定売上の合計' },
  ]

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900">{scopeLabel} 本日</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPIS.map(k => (
          <div key={k.label} className="bg-white border border-gray-300 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-center">
              <div className="text-[12px] font-semibold text-gray-700">{k.label}</div>
            </div>
            <div className="px-3 py-4 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-[26px] font-extrabold leading-none text-gray-900 tracking-tight">
                  {k.value}
                </span>
                <span className="text-[11px] font-bold text-gray-500">{k.unit}</span>
              </div>
            </div>
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 min-h-[44px]">
              <p className="text-[10px] leading-snug text-gray-500">{k.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
