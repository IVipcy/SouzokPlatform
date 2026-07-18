// タスク → 「案件の実務タブ・サブタブ・該当行」への着地先を解決する。
// タスクは source_rid で実務タブの行と1対1で紐づく（例: koseki-read:{請求ID}）。
// これを使ってタスク詳細から実務タブの該当行へピンポイント遷移する（B案の導線）。

import { GYOMU_TAB } from '@/lib/serviceMaster'

export type TaskLanding = {
  tab: string            // 案件詳細のタブ（deceased / assets 等）
  sub?: string           // 相続人調査のサブタブ（koseki 等）
  focus?: string         // 実務タブ内でハイライトする行の識別子
  label: string          // ボタンのラベル（例: 戸籍請求タブ）
}

const stripPhase = (phase: string | null | undefined) => (phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()

// タスクの source_rid / phase から着地先を推定。特定できなければ業務区分→タブのみ。
export function resolveTaskLanding(task: { source_rid: string | null; phase: string | null }): TaskLanding | null {
  const rid = task.source_rid ?? ''

  // 戸籍（請求/読込）→ 相続人調査＞戸籍請求サブタブ、focus=戸籍請求ID
  const km = rid.match(/^koseki(?:-read)?:(.+)$/)
  if (km) return { tab: 'deceased', sub: 'koseki', focus: km[1], label: '戸籍請求タブ' }

  // それ以外は業務区分からタブだけ解決（focusなし）。
  const gyomu = stripPhase(task.phase)
  const tab = GYOMU_TAB[gyomu]
  if (!tab) return null
  const label = tab === 'deceased' ? '相続人調査タブ' : tab === 'assets' ? '財産調査タブ' : `${gyomu}タブ`
  return { tab, label }
}

export function taskLandingUrl(caseId: string, taskId: string, l: TaskLanding): string {
  const p = new URLSearchParams()
  p.set('tab', l.tab)
  if (l.sub) p.set('sub', l.sub)
  if (l.focus) p.set('focus', l.focus)
  p.set('task', taskId)
  return `/cases/${caseId}?${p.toString()}`
}
