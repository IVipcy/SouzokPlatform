-- ============================================================
-- Migration 022: タスクの担当区分（work_role）追加
-- ------------------------------------------------------------
-- タスクを「どのロールの人間がやる作業か」で区別するための
-- 新カラム `work_role` を追加。
--   - manager    … 管理担当（正社員・判断系）
--   - assistant  … アシスタント（パート・手続き系）
--   - accounting … 経理担当（精算系）
--   - sales      … 受注担当（営業系）
--   - NULL       … 未分類（手動で設定）
--
-- 既存タスクは template_key を介して task_templates.default_role
-- から backfill する。
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS work_role TEXT
  CHECK (work_role IN ('manager', 'assistant', 'accounting', 'sales'));

-- 既存タスクを backfill
UPDATE tasks t
SET work_role = tt.default_role
FROM task_templates tt
WHERE t.template_key = tt.key
  AND t.work_role IS NULL
  AND tt.default_role IN ('manager', 'assistant', 'accounting', 'sales');

-- フィルタ用インデックス
CREATE INDEX IF NOT EXISTS idx_tasks_work_role ON tasks(work_role);
