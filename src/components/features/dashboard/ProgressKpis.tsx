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
    { label: '担当件数',  value: String(metrics.totalAssigned),         unit: '件',     desc: 'このスコープに紐づくアクティブ案件（受注済〜未完了）の総数', tone: 'neutral' },
    { label: '青件数',    value: String(metrics.blueCount),             unit: '件',     desc: '進捗が順調で予定通り完了できそうな案件', tone: 'blue' },
    { label: '黄色件数',  value: String(metrics.yellowCount),           unit: '件',     desc: 'タスクに遅れが出始めており、対応が必要な案件', tone: 'yellow' },
    { label: '赤件数',    value: String(metrics.redCount),              unit: '件',     desc: 'タスクに大きな遅れ／完了予定超過。早急にリカバリ必要', tone: 'red' },
    { label: '業完対象',  value: String(metrics.monthCompletionTarget), unit: '件',     desc: '選択月に業務完了予定の案件数', tone: 'neutral' },
    { label: '完了割合',  value: completionRatio,                       unit: '件',     desc: '当月完了予定の案件数に対して、本日時点でどれくらい完了しているか', tone: 'neutral' },
    { label: 'サイクル',  value: metrics.cycleMonths === null ? '-' : metrics.cycleMonths.toFixed(1), unit: 'カ月/件', desc: '当月完了した案件の (完了 − 受注) 平均', tone: 'neutral' },
  ] as const

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900">{scopeLabel} 進捗管理ボード</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {KPIS.map(k => {
          const toneCls =
            k.tone === 'red'    ? 'border-red-300 bg-red-50/40'
            : k.tone === 'yellow' ? 'border-amber-300 bg-amber-50/40'
            : k.tone === 'blue'   ? 'border-blue-300 bg-blue-50/40'
            : 'border-gray-300'
          const valueColor =
            k.tone === 'red' ? 'text-red-700'
            : k.tone === 'yellow' ? 'text-amber-700'
            : k.tone === 'blue' ? 'text-blue-700'
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
              <div className="px-2 py-2 bg-gray-50 border-t border-gray-100 min-h-[42px]">
                <p className="text-[13px] leading-snug text-gray-500">{k.desc}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
