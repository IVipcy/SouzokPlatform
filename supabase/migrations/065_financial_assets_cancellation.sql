-- ============================================================
-- 065_financial_assets_cancellation.sql
-- 解約手続セクション用：金融機関ごとの解約管理カラム（追加のみ・非破壊）
--
--   cancellation_required     : 解約要否（要 / 不要 / 確認中）
--   cancellation_date         : 解約日
--   cancellation_restrictions : 解約時の禁止事項
-- ============================================================

ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS cancellation_required TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS cancellation_date DATE;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS cancellation_restrictions TEXT;

COMMENT ON COLUMN financial_assets.cancellation_required IS '解約要否（要/不要/確認中）';
COMMENT ON COLUMN financial_assets.cancellation_date IS '解約日';
COMMENT ON COLUMN financial_assets.cancellation_restrictions IS '解約時の禁止事項';
