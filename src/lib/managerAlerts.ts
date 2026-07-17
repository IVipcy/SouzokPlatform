// 管理担当マイページの案件行に出すアラート定義。色（重大度）＋ラベル＋遷移先を一元管理。
// アラートセンター(api/alerts)と同じ判定を、案件行の色付きチップに流用する。

export type ManagerAlertKey =
  | 'complaint' | 'advanceMissing' | 'advanceSend' | 'completionOverdue'
  | 'taskOverdue' | 'noTasks' | 'weeklyMissing' | 'contractPending' | 'reviewRequest'

export type AlertSeverity = 'claim' | 'high' | 'mid' | 'info'

export type ManagerAlertChip = { key: ManagerAlertKey; label: string; severity: AlertSeverity; href: string }

// severity → チップの色（claim=紫/high=赤/mid=琥珀/info=青）
export const ALERT_CHIP_CLS: Record<AlertSeverity, string> = {
  claim: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  high:  'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  mid:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  info:  'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
}

// アラート定義：ラベル・重大度・遷移先（案件ID→URL）
export const MANAGER_ALERT_META: Record<ManagerAlertKey, { label: string; severity: AlertSeverity; href: (caseId: string) => string }> = {
  complaint:         { label: 'クレーム',       severity: 'claim', href: id => `/cases/${id}` },
  advanceMissing:    { label: '前受金 未請求',       severity: 'high', href: id => `/cases/${id}?tab=contract` },
  advanceSend:       { label: '前受金 郵送・入金待ち', severity: 'high', href: id => `/cases/${id}?tab=contract` },
  completionOverdue: { label: '完了予定日 超過', severity: 'high',  href: id => `/cases/${id}?tab=tasks` },
  taskOverdue:       { label: 'タスク期限超過',  severity: 'high',  href: id => `/cases/${id}?tab=tasks` },
  noTasks:           { label: 'タスク未生成',    severity: 'mid',   href: id => `/cases/${id}?tab=tasks` },
  weeklyMissing:     { label: '週次報告の漏れ',  severity: 'mid',   href: () => `/my?tab=progress` },
  contractPending:   { label: '契約手続き 未了', severity: 'mid',   href: id => `/cases/${id}?tab=contractProc` },
  reviewRequest:     { label: '進捗確認依頼',    severity: 'info',  href: () => `/my?tab=reviews` },
}

// 重大度の重い順（表示ソート用）
const SEV_RANK: Record<AlertSeverity, number> = { claim: 0, high: 1, mid: 2, info: 3 }

// 該当キー配列 → チップ配列（重大度順）
export function buildAlertChips(caseId: string, keys: ManagerAlertKey[]): ManagerAlertChip[] {
  return keys
    .map(key => ({ key, ...MANAGER_ALERT_META[key], href: MANAGER_ALERT_META[key].href(caseId) }))
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
}
