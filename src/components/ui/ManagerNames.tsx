// 一覧の「管理担当」セル。主担当とサブ管理担当を1列に並べる。
//
// 列は分けない。サブが付く案件は引継ぎ・応援中だけで少数のため、
// 列を1本増やすと大半の行が空欄になる。探すときも「誰に聞けばいいか」を見たいので、
// 主かサブかは二の次で、同じ列にまとまっている方が目で追える。

export default function ManagerNames({ name, subName }: {
  name?: string | null
  subName?: string | null
}) {
  if (!name && !subName) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {name ? <span>{name}</span> : <span className="text-gray-300">—</span>}
      {subName && (
        <span className="inline-flex items-center gap-1">
          <span>{subName}</span>
          <span className="px-1 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">サブ</span>
        </span>
      )}
    </span>
  )
}
