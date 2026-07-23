import MeetingSheetClient from './MeetingSheetClient'

export const metadata = { title: '面談シート（仮）' }

// 面談シート（仮版）。受注担当マイページのリンクから開く。DB連携なし・見た目/操作感の確認用。
export default function MeetingSheetPage() {
  return <MeetingSheetClient />
}
