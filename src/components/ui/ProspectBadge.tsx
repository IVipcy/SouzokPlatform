// 見込み度合い（高/中/低/不明）のバッジ。相談案件一覧・LP案件一覧で共用。
// 色は相談結果登録フォームの選択肢と揃える（高=緑/中=琥珀/低=赤/不明=灰）。
const PROSPECT_STYLE: Record<string, string> = {
  '高': 'bg-green-50 text-green-700 border-green-200',
  '中': 'bg-amber-50 text-amber-700 border-amber-200',
  '低': 'bg-red-50 text-red-700 border-red-200',
  '不明': 'bg-gray-50 text-gray-500 border-gray-200',
}

export default function ProspectBadge({ level }: { level?: string | null }) {
  if (!level) return <span className="text-gray-300">—</span>
  const cls = PROSPECT_STYLE[level] ?? 'bg-gray-50 text-gray-500 border-gray-200'
  return <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>{level}</span>
}
