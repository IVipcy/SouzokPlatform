-- 案件クローズタスクが完了になったら、案件の completion_date を自動セット
-- template_key = 'case_close' のタスクが 完了 になった時点で発火
CREATE OR REPLACE FUNCTION auto_set_case_completion_date()
RETURNS TRIGGER AS $$
BEGIN
  -- 「完了」に変わった瞬間のみ
  IF NEW.status = '完了' AND (OLD.status IS DISTINCT FROM '完了') THEN
    -- case_close テンプレートのタスクなら案件の完了日を設定
    IF NEW.template_key = 'case_close' THEN
      UPDATE cases
        SET completion_date = CURRENT_DATE
        WHERE id = NEW.case_id
          AND completion_date IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_set_case_completion_date ON tasks;
CREATE TRIGGER trg_auto_set_case_completion_date
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_case_completion_date();
