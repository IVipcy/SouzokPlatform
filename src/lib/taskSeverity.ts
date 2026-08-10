// タスクの「重さ」を4段階で表す。
//
// 事務管理ダッシュボードの上部バナーと、その中の業務タブが同じ判定・同じ色を使う。
// 別々に書くと「バナーは赤なのにタブは黄」のようなズレが必ず出るので、ここだけを直せば両方変わるようにしている。
//
//   赤     急ぎ・超急ぎ                    → 要注意バナー
//   黄     期限を5営業日以上超過           → 要確認バナー
//   緑     期限超過（5営業日未満）         → タブの色だけ（バナーは出さない）
//   薄い青 期限内                          → 何もない状態
//
// 営業日は日曜と祝日だけ休み（土曜は営業日）。bizDaysOverdue に合わせている。

import { bizDaysOverdue } from '@/lib/overdue'

/** 期限を何営業日超過したら黄（要確認）にするか */
export const TASK_CHUI_BIZ_DAYS = 5

export type TaskSeverity = 'red' | 'amber' | 'green' | 'blue'

type SeverityInput = { due_date?: string | null; priority?: string | null }

/** 重い順（小さいほど重い）。タブの色を決めるときの比較に使う。 */
export const SEVERITY_RANK: Record<TaskSeverity, number> = { red: 0, amber: 1, green: 2, blue: 3 }

export function taskSeverity(t: SeverityInput, today: string): TaskSeverity {
  if (t.priority === '急ぎ' || t.priority === '超急ぎ') return 'red'
  const over = t.due_date ? bizDaysOverdue(t.due_date, today) : 0
  if (over >= TASK_CHUI_BIZ_DAYS) return 'amber'
  if (over > 0) return 'green'
  return 'blue'
}

/** まとまりの中でいちばん重い段階。1件も無ければ薄い青。 */
export function worstSeverity(list: SeverityInput[], today: string): TaskSeverity {
  let worst: TaskSeverity = 'blue'
  for (const t of list) {
    const s = taskSeverity(t, today)
    if (SEVERITY_RANK[s] < SEVERITY_RANK[worst]) worst = s
  }
  return worst
}

/** 点の意味（タブのツールチップ） */
export const SEVERITY_TAB_NOTE: Record<TaskSeverity, string> = {
  red: '急ぎ・超急ぎのタスクがあります',
  amber: `期限を${TASK_CHUI_BIZ_DAYS}営業日以上超過したタスクがあります`,
  green: '期限を過ぎたタスクがあります',
  blue: '期限を過ぎたタスクはありません',
}

/** タブの見た目（点・件数バッジ・文字色） */
export const SEVERITY_TAB: Record<TaskSeverity, { dot: string; badge: string; text: string }> = {
  red: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', text: 'text-red-700' },
  amber: { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', text: 'text-amber-700' },
  green: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
  blue: { dot: 'bg-sky-300', badge: 'bg-sky-50 text-sky-600', text: 'text-gray-500' },
}
