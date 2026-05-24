-- ============================================================
-- 043_tasks_completion_dates.sql
-- タスクに「作業完了予定日」と「作業完了日」を追加。
--   - expected_completion_date : 予定日（手動入力）
--   - completed_at             : 完了日。status='完了' に変化したタイミングで自動入力
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS expected_completion_date DATE,
  ADD COLUMN IF NOT EXISTS completed_at DATE;

-- 完了時に自動で completed_at を CURRENT_DATE にセットするトリガ
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- 完了に切り替わった瞬間に当日日付をセット（既に値があれば尊重）
  IF NEW.status = '完了' AND (OLD.status IS DISTINCT FROM '完了') AND NEW.completed_at IS NULL THEN
    NEW.completed_at = CURRENT_DATE;
  END IF;
  -- 完了から外れた場合は completed_at をクリア
  IF NEW.status <> '完了' AND OLD.status = '完了' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_task_completed_at ON tasks;
CREATE TRIGGER trg_set_task_completed_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_completed_at();
