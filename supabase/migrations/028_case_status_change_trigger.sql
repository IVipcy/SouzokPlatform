-- ============================================================
-- 028_case_status_change_trigger.sql
-- 案件ステータス変更を activity_log に自動記録するトリガー
--
-- ダッシュボードの「当月面談数」「受注率」などのために、
-- 案件のステータス変更履歴（誰が・いつ・どこから・どこへ）を
-- DB側で確実に残す。
-- ============================================================

CREATE OR REPLACE FUNCTION log_case_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO activity_log (entity_type, entity_id, action, old_value, new_value, created_at)
    VALUES ('case', NEW.id, 'status_change', OLD.status, NEW.status, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_status_change_log ON cases;

CREATE TRIGGER cases_status_change_log
AFTER UPDATE OF status ON cases
FOR EACH ROW EXECUTE FUNCTION log_case_status_change();
