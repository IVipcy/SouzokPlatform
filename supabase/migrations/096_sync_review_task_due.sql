-- ============================================================
-- 096_sync_review_task_due.sql
-- お客様回答予定日(client_response_due_date)を変更したら、初期タスク
-- 「検討状況の確認」(sys_review_status) の期限(due_date)を自動で追従させる。
--   従来は生成時に回答予定日をコピーするだけで、後から回答予定日を変えても
--   タスク期限に反映されなかった。
-- 完了済みタスクは履歴として変更しない（status <> '完了' のみ更新）。
-- ============================================================

CREATE OR REPLACE FUNCTION sync_review_task_due_on_response_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_response_due_date IS DISTINCT FROM OLD.client_response_due_date THEN
    UPDATE tasks
       SET due_date = NEW.client_response_due_date
     WHERE case_id = NEW.id
       AND template_key = 'sys_review_status'
       AND status <> '完了';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_sync_review_task_due ON cases;
CREATE TRIGGER cases_sync_review_task_due
AFTER UPDATE OF client_response_due_date ON cases
FOR EACH ROW EXECUTE FUNCTION sync_review_task_due_on_response_date();
