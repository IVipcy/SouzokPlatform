-- ============================================================
-- 152_billing_expense_source.sql
-- 請求タブの立替実費に「実務タブからの取り込み元」を記録する列。
-- source_kind/source_id が入った行＝自動取り込み分（再取り込み時は入れ替え）。
-- NULL の行＝手入力分（取り込みでは消さない）。
-- ============================================================
ALTER TABLE billing_expense_items ADD COLUMN IF NOT EXISTS source_kind text;
ALTER TABLE billing_expense_items ADD COLUMN IF NOT EXISTS source_id uuid;
