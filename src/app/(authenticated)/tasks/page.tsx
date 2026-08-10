import { redirect } from 'next/navigation'

// 事務管理タスク一覧は事務管理ダッシュボードの「タスク」タブに統合した。
// 朝いちで 作業着手待ち → タスク → 郵便 と見るのに画面を行き来していたため。
// 旧URLのブックマーク・既存リンク対策としてダッシュボードへ転送する。
export default function TasksPage() {
  redirect('/dashboard/office')
}
