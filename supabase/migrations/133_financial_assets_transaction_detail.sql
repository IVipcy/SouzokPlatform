-- ============================================================
-- 133_financial_assets_transaction_detail.sql
-- 証券の「取引明細」取得要否（要/不要/確認中）。残高証明の右に表示する列（追加のみ・非破壊）。
-- ============================================================

ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS transaction_detail_required TEXT;
