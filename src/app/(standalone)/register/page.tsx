import { redirect } from 'next/navigation'

// 相談案件登録は統合入力アプリ /intake に統合。旧URLはリダイレクト。
export default function RegisterPage() {
  redirect('/intake')
}
