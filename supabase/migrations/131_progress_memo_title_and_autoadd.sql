-- 進捗メモ（case_activities の note）にタイトル列を追加し、
-- タスク完了をトリガーに「実施結果・引継ぎ事項」を進捗メモへ自動追加する。
--   タイトル＝NULL（表示側でタスクリンクにフォールバック）／詳細＝実施結果／記載日＝完了日／記載者＝着手者(started_by)。
--   実施結果が空の完了では追加しない（アプリ側で実施結果を必須化済）。再完了のたびに追加（最新が正）。

ALTER TABLE case_activities ADD COLUMN IF NOT EXISTS title text;
COMMENT ON COLUMN case_activities.title IS '進捗メモのタイトル（任意）。NULLならタスクリンク等にフォールバック表示。';

CREATE OR REPLACE FUNCTION add_progress_memo_on_task_complete()
RETURNS TRIGGER AS $$
DECLARE
  result text;
BEGIN
  -- 完了に切り替わった瞬間のみ
  IF NEW.status = '完了' AND OLD.status IS DISTINCT FROM '完了' THEN
    result := NULLIF(btrim(COALESCE(NEW.ext_data->>'execution_result', '')), '');
    IF result IS NOT NULL THEN
      INSERT INTO case_activities (case_id, task_id, member_id, activity_type, description, activity_date, title)
      VALUES (NEW.case_id, NEW.id, NEW.started_by, 'note', result, COALESCE(NEW.completed_at, CURRENT_DATE), NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_add_progress_memo_on_task_complete ON tasks;
CREATE TRIGGER trg_add_progress_memo_on_task_complete
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION add_progress_memo_on_task_complete();
