-- case_complaints の RLS ポリシー追加。
-- migration 197 で CREATE TABLE したが RLS ポリシーの設定が抜けていたため、
-- Supabase の RLS 有効設定と相まって「row-level security policy for table case_complaints」で
-- INSERT が弾かれていた。他テーブル(progress_reports 等) と同じく authenticated 全許可にする。

ALTER TABLE case_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_complaints_all ON case_complaints;
CREATE POLICY case_complaints_all ON case_complaints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
