-- ============================================================
-- 057_tasks_team_assignment.sql
-- タスクの「担当チーム」割り当て（引き継ぎ仕様 フェーズ4）
--
-- マイページのタスク作成フォームで「担当チーム」を指定できるようにする。
-- 担当チームが設定されたタスクは、そのチームのチームタスク欄（フェーズ5）に出る基盤になる。
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
