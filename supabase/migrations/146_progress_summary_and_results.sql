-- ============================================================
-- 146_progress_summary_and_results.sql
-- 各タブ/サブタブの「進捗サマリー」（手動）と、各行の実施結果/調査結果列。
-- 画面を見れば現状が分かるようにする（読込結果がタスク詳細に埋もれる問題の解消）。
-- ============================================================

-- 汎用の進捗サマリー（scope_key でどのタブ/サブタブ/事業者かを区別）
CREATE TABLE IF NOT EXISTS progress_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  scope_key text NOT NULL,          -- koseki / asset_realestate / asset_deposit / ... / referral_税理士 / division / registration / cancellation / succession_instruction
  body text,
  updated_by uuid REFERENCES members(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS progress_summaries_case_scope ON progress_summaries(case_id, scope_key);

ALTER TABLE progress_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progress_summaries_all ON progress_summaries;
CREATE POLICY progress_summaries_all ON progress_summaries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 各行の結果列
ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS read_result text;          -- 戸籍：読込結果
ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS survey_result text,         -- 不動産：調査結果
  ADD COLUMN IF NOT EXISTS registration_result text;   -- 相続登記：実施結果
ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS survey_result text,          -- 金融（預金/証券/信託）：調査結果
  ADD COLUMN IF NOT EXISTS cancellation_result text;    -- 解約：実施結果
