-- ============================================================
-- 162_asset_survey_prohibition.sql
-- 財産調査の「禁止期間（開始/終了）・禁止理由」を口座単位（financial_assets）に持たせる（A案）。
-- 「開始条件・使用書類」は案件単位（cases）のまま。
-- 既存の案件単位の禁止期間/理由は、その案件の各口座に初期反映（データを失わないため）。
-- ============================================================

ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS survey_prohibited_start DATE,
  ADD COLUMN IF NOT EXISTS survey_prohibited_end DATE,
  ADD COLUMN IF NOT EXISTS survey_prohibited_reason TEXT;

COMMENT ON COLUMN financial_assets.survey_prohibited_start IS '財産調査禁止期間 開始日（口座単位）';
COMMENT ON COLUMN financial_assets.survey_prohibited_end IS '財産調査禁止期間 終了日（口座単位）';
COMMENT ON COLUMN financial_assets.survey_prohibited_reason IS '財産調査禁止理由（口座単位）';

-- 既存の案件単位の禁止期間/理由を各口座へ初期反映（口座側が未設定のもののみ）
UPDATE financial_assets fa
  SET survey_prohibited_start  = c.financial_survey_prohibited_start,
      survey_prohibited_end    = c.financial_survey_prohibited_end,
      survey_prohibited_reason = c.financial_survey_prohibited_reason
  FROM cases c
  WHERE fa.case_id = c.id
    AND (c.financial_survey_prohibited_start IS NOT NULL
      OR c.financial_survey_prohibited_end IS NOT NULL
      OR c.financial_survey_prohibited_reason IS NOT NULL)
    AND fa.survey_prohibited_start IS NULL
    AND fa.survey_prohibited_end IS NULL
    AND fa.survey_prohibited_reason IS NULL;
