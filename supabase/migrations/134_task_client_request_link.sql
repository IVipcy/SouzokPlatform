-- ============================================================
-- 134_task_client_request_link.sql
-- お客様依頼起点のタスク化機能向けに、tasks にやり取り履歴とのFKと起源タグを追加。
--   tasks.client_communication_id : client_communications.id への FK
--   tasks.origin                  : 起源タグ（'client_request' 等。任意）
-- 追加のみ・非破壊。
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_communication_id UUID
  REFERENCES client_communications(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS origin TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_client_communication ON tasks(client_communication_id)
  WHERE client_communication_id IS NOT NULL;
