import Link from 'next/link'

// チームダッシュボードの 受注担当 / 管理担当 タブ。
// 同じチームの2つの面なので、画面名は「〇〇チーム」1つにして、中をタブで分ける。
// 受注担当・管理担当のどちらのアカウントでも両方見られる（自チームであれば閲覧可）。
export default function TeamViewSwitch({ teamId, current }: {
  teamId: string
  current: 'progress' | 'sales'
}) {
  const cls = (active: boolean) =>
    `inline-flex items-center px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
      active
        ? 'border-brand-600 text-brand-700'
        : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
    }`
  return (
    <div className="flex gap-1 mb-4 border-b border-gray-200 flex-wrap">
      <Link href={`/dashboard/team/${teamId}`} className={cls(current === 'sales')}>受注担当</Link>
      <Link href={`/dashboard/team/${teamId}/progress`} className={cls(current === 'progress')}>管理担当</Link>
    </div>
  )
}
