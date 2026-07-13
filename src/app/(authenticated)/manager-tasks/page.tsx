import { redirect } from 'next/navigation'

// 管理担当タスク一覧は廃止。管理担当・受注担当のタスクはマイページの「自分のタスク」に表示する。
// 旧URLのブックマーク対策としてマイページへリダイレクトする。
export default function ManagerTasksPage() {
  redirect('/my')
}
