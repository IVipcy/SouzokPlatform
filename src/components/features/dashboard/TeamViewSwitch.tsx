import Link from 'next/link'

// チームダッシュボードの 管理担当ビュー / 受注担当ビュー 切替。
// 同じチームなのに受注と管理でページが分かれていて行き来しづらいため、
// 両方見られる人（システム管理者）にだけ切替を出す。マイページの切替と同じ見た目。
// 通常の受注担当・管理担当には自分のビューしか見えないので、この切替は出さない。
export default function TeamViewSwitch({ teamId, current }: {
  teamId: string
  current: 'progress' | 'sales'
}) {
  const cls = (active: boolean) =>
    `px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${
      active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`
  return (
    <div className="flex gap-2 mb-4">
      <Link href={`/dashboard/team/${teamId}/progress`} className={cls(current === 'progress')}>管理担当ビュー</Link>
      <Link href={`/dashboard/team/${teamId}`} className={cls(current === 'sales')}>受注担当ビュー</Link>
    </div>
  )
}
