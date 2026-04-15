/**
 * タスクテンプレート → AI書類テンプレート の紐付け。
 * ここに載っているタスクだけ、タスク詳細画面に「AI書類作成」ボタンが出る。
 */

export type TaskAiTemplate = {
  /** AiDocumentModal の templateKey と一致させる */
  templateKey: string
  label: string
  icon: string
}

export const TASK_AI_TEMPLATES: Record<string, TaskAiTemplate> = {
  heir_survey_create:  { templateKey: 'heir-survey',        label: '相続人調査報告書', icon: '👨‍👩‍👧' },
  asset_list_create:   { templateKey: 'property-list',      label: '財産目録',         icon: '💰' },
  division_draft:      { templateKey: 'division-agreement', label: '遺産分割協議書',   icon: '📜' },
  division_finalize:   { templateKey: 'division-agreement', label: '遺産分割協議書',   icon: '📜' },
}

export function getTaskAiTemplate(templateKey: string | null | undefined): TaskAiTemplate | null {
  if (!templateKey) return null
  return TASK_AI_TEMPLATES[templateKey] ?? null
}
