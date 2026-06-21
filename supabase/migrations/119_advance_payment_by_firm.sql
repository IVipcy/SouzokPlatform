-- 前受金を法人別（行政書士法人／司法書士法人）に保持。報酬(fee_administrative/fee_judicial)と同じ構造。
-- 既存の単一 advance_payment は後方互換で残す（合算/旧値として扱う）。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS advance_payment_administrative numeric;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS advance_payment_judicial numeric;

COMMENT ON COLUMN cases.advance_payment_administrative IS '前受金（行政書士法人ぶん・税込）';
COMMENT ON COLUMN cases.advance_payment_judicial IS '前受金（司法書士法人ぶん・税込）';
