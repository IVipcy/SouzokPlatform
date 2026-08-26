import type { ProgressKpiBundle } from '@/lib/dashboardMetrics'

type Props = {
  scopeLabel: string  // 例: "高橋チーム" / "福島優"
  metrics: ProgressKpiBundle
}

export default function ProgressKpis({ scopeLabel, metrics }: Props) {
  const completionRatio = metrics.monthCompletionTarget > 0
    ? `${metrics.monthCompleted}/${metrics.monthCompletionTarget}`
    : `${metrics.monthCompleted}/-`

  const KPIS = [
    { label: '担当件数', value: String(metrics.totalAssigned), unit: '件', desc: '担当として割り当てられている案件数の合計（期間で絞り込みません）', tone: 'neutral' },
    { label: 'アラートなし', value: String(metrics.blueCount), unit: '件', desc: 'アラートが1つも出ていない順調な案件', tone: 'blue' },
    { label: '要確認', value: String(metrics.yellowCount), unit: '件', desc: '要確認のアラートが出ている案件。要確認バナーと同じ判定で、色も同じ', tone: 'yellow' },
    { label: '要注意', value: String(metrics.redCount), unit: '件', desc: '要注意のアラートが1つ以上出ている案件。何が出ているかは案件名の下のバッジに出ます', tone: 'red' },
    { label: 'クレーム', value: String(metrics.purpleCount), unit: '件', desc: 'クレームが発生している案件。要注意よりさらに優先して対応する', tone: 'purple' },
    { label: '完了割合', value: completionRatio, unit: '件', desc: '当月業務完了予定の案件数に対して、本日時点でどれくらい完了しているかの割合', tone: 'neutral' },
    { label: 'サイクル', value: metrics.cycleMonths === null ? '-' : metrics.cycleMonths.toFixed(1), unit: 'カ月/件', desc: '今月業務完了した案件が受注してから業務完了するまでにかかった期間の平均', tone: 'neutral' },
    { label: '請求件数', value: String(metrics.invoiceCount), unit: '件', desc: '当月に発行された請求書の件数', tone: 'amber' },
  ] as const

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-brand-900">{scopeLabel} 進捗管理ボード</h2>
        {/* 案件色は「その案件に出ているアラートで一番重い色」でしかない。条件は alertRules.ts に集約。 */}
        <span className="text-[11.5px] text-gray-400">案件の色＝出ているアラートで一番重い色（クレーム＞要注意＞要確認＞なし）</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {KPIS.map(k => {
          const toneCls =
            k.tone === 'red'    ? 'border-[#DC2626] bg-[#DC2626]/10'
            : k.tone === 'yellow' ? 'border-[#EAB308] bg-[#EAB308]/10'
            : k.tone === 'blue'   ? 'border-brand-300 bg-brand-50/40'
            : k.tone === 'purple' ? 'border-purple-300 bg-purple-50/50'
            : k.tone === 'amber'  ? 'border-amber-400 bg-amber-50'
            : 'border-gray-300'
          const valueColor =
            k.tone === 'red' ? 'text-[#DC2626]'
            : k.tone === 'yellow' ? 'text-[#B98410]'
            : k.tone === 'blue' ? 'text-brand-700'
            : k.tone === 'purple' ? 'text-purple-700'
            : k.tone === 'amber'  ? 'text-amber-700'
            : 'text-gray-900'
          return (
            <div key={k.label} className={`bg-white border rounded-xl overflow-hidden ${toneCls}`}>
              <div className="px-2 py-2 border-b border-gray-200 bg-white text-center">
                <div className="text-[13px] font-semibold text-gray-700">{k.label}</div>
              </div>
              <div className="px-2 py-3 text-center">
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className={`text-[22px] font-extrabold leading-none tracking-tight ${valueColor}`}>
                    {k.value}
                  </span>
                  <span className="text-[14px] font-bold text-gray-500">{k.unit}</span>
                </div>
              </div>
              <div className="px-2 py-2 bg-gray-50 border-t border-gray-100 min-h-[60px]">
                <p className="text-[12px] leading-snug text-gray-500">{k.desc}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
