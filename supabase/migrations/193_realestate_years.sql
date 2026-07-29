-- ============================================================
-- 193_realestate_years.sql
-- 名寄帳／評価証明の「別表分割」用の年度列（エクセルR69準拠）。
--   ・名寄帳＝市区町村単位の請求(real_estate_acquisitions)に年度
--   ・評価証明＝物件単位(real_estate_properties)に年度
-- 年度は和暦文字列（例: 令和6年度）で保持する。
-- ============================================================

ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS myna_year text;    -- 名寄帳の年度（市区町村単位）
ALTER TABLE real_estate_properties  ADD COLUMN IF NOT EXISTS eval_cert_year text; -- 固定資産評価証明の年度（物件単位）

-- PostgREST schema cache をリロード
NOTIFY pgrst, 'reload schema';
