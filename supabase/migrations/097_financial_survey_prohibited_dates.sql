-- 財産調査禁止期間を開始日・終了日で管理できるようにする（いつからいつまで禁止か）
-- 既存の financial_survey_prohibited_period（自由記述）は残し、新たに開始/終了の日付列を追加。

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS financial_survey_prohibited_start DATE,
  ADD COLUMN IF NOT EXISTS financial_survey_prohibited_end DATE;

COMMENT ON COLUMN cases.financial_survey_prohibited_start IS '財産調査禁止期間 開始日';
COMMENT ON COLUMN cases.financial_survey_prohibited_end IS '財産調査禁止期間 終了日';
