-- ============================================================
-- 032_property_rank_per_property.sql
-- 不動産評価ランクを案件単位から物件単位に移行する第一歩。
--
-- real_estate_properties に rank カラムを追加。
-- cases.property_rank は当面の後方互換のために残置するが、
--   - UI 表示・編集箇所からは隠す
--   - 後続の運用で問題なければ別 migration で DROP 予定
-- ============================================================

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS rank TEXT
    CHECK (rank IS NULL OR rank IN ('S', 'A', 'B', 'C', '確認中'));

CREATE INDEX IF NOT EXISTS idx_real_estate_properties_rank
  ON real_estate_properties(rank)
  WHERE rank IS NOT NULL;
