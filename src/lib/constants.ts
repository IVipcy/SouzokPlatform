// === フェーズ定義 ===
export const PHASES = [
  { key: 'Phase1:相続人調査', label: 'Phase1: 相続人調査', color: '#2563EB' },
  { key: 'Phase2:財産調査', label: 'Phase2: 財産調査', color: '#7C3AED' },
  { key: 'Phase3:不動産・相続税', label: 'Phase3: 不動産・相続税', color: '#D97706' },
  { key: 'Phase4:遺産分割', label: 'Phase4: 遺産分割', color: '#059669' },
  { key: 'Phase5:登記・解約', label: 'Phase5: 登記・解約', color: '#EA580C' },
  { key: 'Phase6:完了・精算', label: 'Phase6: 完了・精算', color: '#DC2626' },
] as const

// === 案件ステータス ===
export const CASE_STATUSES = [
  { key: '架電案件化', color: '#6B7280' },
  { key: '面談設定済', color: '#3B82F6' },
  { key: '検討中', color: '#D97706' },
  { key: '受注', color: '#16A34A' },
  { key: '対応中', color: '#7C3AED' },
  { key: '保留・長期', color: '#EA580C' },
  { key: '完了', color: '#059669' },
  { key: '失注', color: '#DC2626' },
] as const

// === タスクステータス ===
export const TASK_STATUSES = [
  { key: '未着手', color: '#6B7280' },
  { key: '対応中', color: '#2563EB' },
  { key: 'Wチェック待ち', color: '#7C3AED' },
  { key: '差戻し', color: '#DC2626' },
  { key: '完了', color: '#059669' },
] as const

// === ロール ===
export const ROLES = [
  { key: 'sales', label: '受注担当' },
  { key: 'manager', label: '管理担当' },
  { key: 'assistant', label: '管理担当アシスタント' },
  { key: 'lp', label: 'LP担当' },
  { key: 'accounting', label: '経理担当' },
] as const
