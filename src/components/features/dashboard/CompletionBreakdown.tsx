import { formatMan, type ProcedureBreakdown, type ProcedureBucket } from '@/lib/dashboardMetrics'

type Props = {
  breakdown: ProcedureBreakdown
}

// 区分ごとの配色（Ocean ブランドのトーン + 補色）
const COLORS: Record<ProcedureBucket, string> = {
  '手続一式': '#0f487e',          // brand-600
  '登記': '#3a82c8',              // brand-400
  '遺産分割協議書のみ': '#7eb6e5', // brand-300
  '相続人調査のみ': '#bfdaf2',     // brand-200
  '未設定': '#d1d5db',             // gray-300
}

// SVG ドーナツチャート
// data: [{ ratio, color }] — ratio は 0..1
function Donut({ data, size = 180, stroke = 28 }: { data: { ratio: number; color: string }[]; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 背景 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={stroke}
      />
      {data.map((d, i) => {
        if (d.ratio <= 0) return null
        const length = circ * d.ratio
        const dasharray = `${length} ${circ - length}`
        const dashoffset = -offset
        offset += length
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={d.color}
            strokeWidth={stroke}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        )
      })}
    </svg>
  )
}

export default function CompletionBreakdown({ breakdown }: Props) {
  const { totalAmount, totalCases, items } = breakdown
  // 0 件のバケットは表に出さない
  const visibleItems = items.filter(it => it.caseCount > 0 || it.amount > 0)

  if (totalCases === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
        <div className="text-[14px] text-gray-500">当月に業務完了した案件がまだありません</div>
        <div className="text-[12px] text-gray-400 mt-1">完了案件が登録されると、ここに手続区分別の内訳が表示されます</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
      {/* 左: 当月の業務完了総額 + ドーナツ */}
      <div className="flex flex-col items-center gap-4">
        <div className="bg-gradient-to-br from-brand-50 to-white border border-brand-100 rounded-xl px-5 py-4 text-center min-w-[180px]">
          <div className="text-[11px] text-gray-500 mb-1">当月の業務完了総額</div>
          <div className="flex items-baseline justify-center gap-1">
            <span className="font-mono font-extrabold text-[28px] text-brand-700 leading-none">{formatMan(totalAmount)}</span>
            <span className="text-[12px] font-semibold text-gray-500">万円</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{totalCases}件</div>
        </div>

        <div className="relative">
          <Donut
            data={items.map(it => ({ ratio: it.ratio, color: COLORS[it.procedure] }))}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[10px] text-gray-400">完了案件</div>
            <div className="font-mono font-bold text-[20px] text-gray-800">{totalCases}</div>
            <div className="text-[10px] text-gray-400">件</div>
          </div>
        </div>
      </div>

      {/* 右: 一覧表 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 460 }}>
          <thead>
            <tr>
              <th className="border-b border-gray-200 px-3 py-2 text-left text-[12px] font-semibold text-gray-500">手続区分</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right text-[12px] font-semibold text-gray-500">件数</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right text-[12px] font-semibold text-gray-500">金額</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right text-[12px] font-semibold text-gray-500">割合</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map(it => {
              const pct = Math.round(it.ratio * 100)
              return (
                <tr key={it.procedure} className="hover:bg-gray-50">
                  <td className="border-b border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: COLORS[it.procedure] }}
                      />
                      <span className="text-[13px] text-gray-700">{it.procedure}</span>
                    </div>
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 text-right font-mono text-[13px] text-gray-700">
                    {it.caseCount}件
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 text-right font-mono text-[13px] font-semibold text-gray-900">
                    {formatMan(it.amount)}<span className="text-[10px] text-gray-400 ml-0.5">万円</span>
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-[13px] text-gray-700 w-10 text-right">{pct}%</span>
                      <div className="w-16 h-1.5 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[it.procedure] }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
            {/* 合計行 */}
            <tr>
              <td className="px-3 py-2 text-[12px] font-semibold text-gray-600">合計</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] font-semibold text-gray-700">{totalCases}件</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] font-bold text-brand-700">
                {formatMan(totalAmount)}<span className="text-[10px] text-gray-400 ml-0.5">万円</span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-[12px] text-gray-500">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
