// タスクの「重さ」を4段階で表す。
//
// 事務管理ダッシュボードの上部バナーと、その中の業務タブが同じ判定・同じ色を使う。
// 別々に書くと「バナーは赤なのにタブは緑」のようなズレが必ず出るので、ここだけを直せば両方変わるようにしている。
//
// 何日遅れたら重く見るかは業務によって違う。
// 相続人調査は役所への請求待ちが読めるぶん遅れに厳しく、財産調査・遺産分割は
// 相手（金融機関・相続人）の返事待ちが長いので少し猶予がある。
//
//   青       期限内〜2営業日超過
//   緑       少し遅れている
//   オレンジ 遅れが目立つ        → 要確認バナー
//   赤       大きく遅れている    → 要注意バナー（急ぎ・超急ぎもこちら）
//
// 営業日は日曜と祝日だけ休み（土曜は営業日）。bizDaysOverdue に合わせている。

import { bizDaysOverdue } from '@/lib/overdue'

export type TaskSeverity = 'red' | 'orange' | 'green' | 'blue'

/** その色になる超過営業日数の下限 */
export type SeverityThresholds = { green: number; orange: number; red: number }

/** 財産調査（不動産・金融資産）・遺産分割。ほかの業務もこれに合わせる */
export const THRESHOLDS_ASSETS: SeverityThresholds = { green: 3, orange: 5, red: 8 }
/** 相続人調査（戸籍）。遅れが後工程を全部止めるので早めに色を上げる */
export const THRESHOLDS_HEIRS: SeverityThresholds = { green: 3, orange: 4, red: 6 }

/** 業務区分 → しきい値。ここに無い業務は財産調査と同じ */
const THRESHOLDS_BY_GYOMU: Record<string, SeverityThresholds> = {
  '戸籍': THRESHOLDS_HEIRS,
}

/**
 * ヘルプに出す「タブごとのしきい値」。事務管理タスク一覧の業務タブと同じ並び。
 * 業務区分ではなくタブ単位で書くのは、利用者が見ているのがタブだから。
 */
export const TAB_THRESHOLDS: Array<{ tab: string; th: SeverityThresholds; note?: string }> = [
  { tab: '相続人調査', th: THRESHOLDS_HEIRS, note: '役所への請求待ちが読めるぶん、遅れに厳しい' },
  { tab: '不動産調査', th: THRESHOLDS_ASSETS },
  { tab: '金融資産調査', th: THRESHOLDS_ASSETS },
  { tab: '解約手続', th: THRESHOLDS_ASSETS },
  { tab: '相続登記', th: THRESHOLDS_ASSETS },
  { tab: '各種作成物', th: THRESHOLDS_ASSETS, note: '遺産分割協議書・相関図・財産目録' },
  { tab: '納品', th: THRESHOLDS_ASSETS },
  { tab: 'その他', th: THRESHOLDS_ASSETS },
]

/** 期限の絞り込みチップ「大幅超過」の境目（営業日） */
export const TASK_CHUI_BIZ_DAYS = 5

type SeverityInput = { due_date?: string | null; priority?: string | null; phase?: string | null }

/** 業務区分 = task.phase（"PhaseN:" 接頭辞を除く） */
const gyomuOf = (t: SeverityInput) => (t.phase ?? '').replace(/^Phase\d+[:：]\s*/, '')

export const thresholdsOf = (t: SeverityInput): SeverityThresholds =>
  THRESHOLDS_BY_GYOMU[gyomuOf(t)] ?? THRESHOLDS_ASSETS

/** 重い順（小さいほど重い）。タブの色を決めるときの比較に使う。 */
export const SEVERITY_RANK: Record<TaskSeverity, number> = { red: 0, orange: 1, green: 2, blue: 3 }

/** 急ぎ・超急ぎ。日数とは別に、それだけで要注意へ回す */
export const isUrgentTask = (t: SeverityInput) => t.priority === '急ぎ' || t.priority === '超急ぎ'

export function taskSeverity(t: SeverityInput, today: string): TaskSeverity {
  // 急ぎ・超急ぎは日数を待たずに赤。期限にまだ余裕があっても先に手を付けてほしいもの。
  if (isUrgentTask(t)) return 'red'
  const over = t.due_date ? bizDaysOverdue(t.due_date, today) : 0
  const th = thresholdsOf(t)
  if (over >= th.red) return 'red'
  if (over >= th.orange) return 'orange'
  if (over >= th.green) return 'green'
  return 'blue'
}

/** まとまりの中でいちばん重い段階。1件も無ければ青。 */
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
  red: '大きく遅れている／急ぎ・超急ぎのタスクがあります',
  orange: '遅れが目立つタスクがあります',
  green: '少し遅れているタスクがあります',
  blue: '大きく遅れているタスクはありません',
}

/** タブの見た目（点・件数バッジ・文字色） */
export const SEVERITY_TAB: Record<TaskSeverity, { dot: string; badge: string; text: string }> = {
  red: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', text: 'text-red-700' },
  orange: { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800', text: 'text-orange-700' },
  green: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
  blue: { dot: 'bg-sky-300', badge: 'bg-sky-50 text-sky-600', text: 'text-gray-500' },
}

// 絞り込みチップ・ヘルプに出す言葉。色の名前（赤・青）では何のことか分からないので、
// 遅れ具合そのものを名前にする。色は点で示し、タブの点と同じ色でつなぐ。
export const SEVERITY_LABEL: Record<TaskSeverity, string> = {
  red: '大幅遅れ・急ぎ', orange: '遅れ', green: '少し遅れ', blue: '期限内',
}

/** しきい値を「3〜4営業日超過」のような文にする（説明用） */
export function severityRangeText(th: SeverityThresholds, sev: TaskSeverity): string {
  if (sev === 'blue') return th.green === 1 ? '期限内' : `期限内〜${th.green - 1}営業日超過`
  if (sev === 'red') return `${th.red}営業日超過〜`
  const from = sev === 'green' ? th.green : th.orange
  const to = (sev === 'green' ? th.orange : th.red) - 1
  return from === to ? `${from}営業日超過` : `${from}〜${to}営業日超過`
}
