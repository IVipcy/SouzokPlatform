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
    { label: '青色件数', value: String(metrics.blueCount), unit: '件', desc: '順調な案件。下記の赤・黄・紫に当たる要注意事項が無い状態', tone: 'blue' },
    { label: '黄色件数', value: String(metrics.yellowCount), unit: '件', desc: '要フォロー：週次報告の漏れ／面談メモ未記載／回答予定日 超過・間近／最終接触5営業日超過 のいずれか', tone: 'yellow' },
    { label: '赤色件数', value: String(metrics.redCount), unit: '件', desc: '要・早急対応：タスク期限超過／管理担当未アサイン／前受金 未請求・未入金／完了予定日 超過／最終接触10営業日超過 のいずれか', tone: 'red' },
    { label: '紫色件数', value: String(metrics.purpleCount), unit: '件', desc: '依頼者からクレームが発生している最優先案件（赤よりさらに緊急度が高い）', tone: 'purple' },
    { label: '完了割合', value: completionRatio, unit: '件', desc: '当月業務完了予定の案件数に対して、本日時点でどれくらい完了しているかの割合', tone: 'neutral' },
    { label: 'サイクル', value: metrics.cycleMonths === null ? '-' : metrics.cycleMonths.toFixed(1), unit: 'カ月/件', desc: '今月業務完了した案件が受注してから業務完了するまでにかかった期間の平均', tone: 'neutral' },
    { label: '請求件数', value: String(metrics.invoiceCount), unit: '件', desc: '当月に発行された請求書の件数', tone: 'amber' },
  ] as const

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900">{scopeLabel} 進捗管理ボード</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {KPIS.map(k => {
          const toneCls =
            k.tone === 'red'    ? 'border-red-300 bg-red-50/40'
            : k.tone === 'yellow' ? 'border-amber-300 bg-amber-50/40'
            : k.tone === 'blue'   ? 'border-brand-300 bg-brand-50/40'
            : k.tone === 'purple' ? 'border-purple-300 bg-purple-50/50'
            : k.tone === 'amber'  ? 'border-amber-400 bg-amber-50'
            : 'border-gray-300'
          const valueColor =
            k.tone === 'red' ? 'text-red-700'
            : k.tone === 'yellow' ? 'text-amber-700'
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
