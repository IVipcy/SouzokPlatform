-- ============================================================
-- 033_property_appraisal_status.sql
-- 査定対応状況も物件単位に移行（評価ランクと同じ方針）。
--
-- real_estate_properties に appraisal_status カラムを追加。
-- cases.real_estate_appraisal_status は当面後方互換のため残置、
--   - UI 表示・編集箇所からは隠す
--   - 後続の運用で問題なければ別 migration で DROP 予定
-- ============================================================

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS appraisal_status TEXT
    CHECK (appraisal_status IS NULL OR appraisal_status IN ('未対応', '対応中', '完了', '不要'));

CREATE INDEX IF NOT EXISTS idx_real_estate_properties_appraisal_status
  ON real_estate_properties(appraisal_status)
  WHERE appraisal_status IS NOT NULL;
