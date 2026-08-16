import { redirect } from 'next/navigation'

// マニュアルは操作ステップ（章タブ）を入口にする。
// 記事一覧のTOPは1枚はさまるだけで読み始められなかったので廃止した。
// content/manual/*.md の記事は /manual/[slug] で今までどおり開ける。
export default function ManualPage() {
  redirect('/manual/steps')
}
