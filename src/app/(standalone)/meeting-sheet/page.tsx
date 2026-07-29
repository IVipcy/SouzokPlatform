import { redirect } from 'next/navigation'

// 面談シート（仮版）は統合入力アプリ /intake の①タブに統合（DB化）。旧URLはリダイレクト。
export default function MeetingSheetPage() {
  redirect('/intake')
}
