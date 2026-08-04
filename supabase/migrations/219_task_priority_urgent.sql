-- ============================================================
-- 219_task_priority_urgent.sql
-- タスク優先度に「超急ぎ」を追加（通常 / 急ぎ / 超急ぎ）。
--   前受金入金御礼連絡タスク等の最優先タスクに付与し、要注意バナー・行の色分けに使う。
-- ============================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('通常', '急ぎ', '超急ぎ'));
