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

  // 不動産（市区町村役場 re-muni / 法務局 re-houmu ／旧 re）→ 財産調査タブ、focus=市区町村
  const rm = rid.match(/^re(?:-muni|-houmu)?(?:-read)?:(.+)$/)
  if (rm) return { tab: 'assets', focus: rm[1], label: '財産調査タブ（不動産）' }

  // 金融資産（請求/読込）→ 財産調査タブ、focus=金融機関名（AssetsTabが預金/証券/信託を判定して選択）
  const fm = rid.match(/^fin(?:-read)?:(.+)$/)
  if (fm) return { tab: 'assets', focus: fm[1], label: '財産調査タブ（金融）' }

  // 相続登記 → 相続登記タブ（市区町村単位。タブへ遷移）
  const gm = rid.match(/^reg:(.+)$/)
  if (gm) return { tab: 'registration', focus: gm[1], label: '相続登記タブ' }

  // それ以外は業務区分からタブを解決（focusなし）。
  const gyomu = stripPhase(task.phase)
  // 戸籍系タスク（追加請求など source_rid が無いもの）は、戸籍請求サブタブまでは寄せる。
  if (gyomu === '戸籍') return { tab: 'deceased', sub: 'koseki', label: '戸籍請求タブ' }
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
