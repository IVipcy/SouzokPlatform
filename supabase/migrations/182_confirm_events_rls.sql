-- 確認履歴 (confirm_events) の RLS を設定。他テーブル（notifications 等）と同方針で authenticated に全許可。
-- migration 181 で作成時に付け忘れ。無いと INSERT/SELECT が silently 失敗するため履歴に0件しか出ない事象になる。

ALTER TABLE confirm_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS confirm_events_all ON confirm_events;
CREATE POLICY confirm_events_all ON confirm_events
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
