-- case_reports の RLS ポリシー追加。
-- migration 196 で CREATE TABLE したが RLS ポリシーの設定が抜けていたため、
-- Supabase の RLS 有効設定と相まって「row-level security policy for table case_reports」で
-- INSERT が弾かれていた（報連相モーダル送信不可）。他テーブルと同じく authenticated 全許可にする。

ALTER TABLE case_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_reports_all ON case_reports;
CREATE POLICY case_reports_all ON case_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
