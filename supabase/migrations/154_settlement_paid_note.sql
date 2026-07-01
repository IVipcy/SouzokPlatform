-- ============================================================
-- 154_settlement_paid_note.sql
-- 精算書：支出に「振込済」（ミトラ残高からの代理支払等の振込確定）と各行の備考、
-- 収入に各行の備考を追加。
-- ============================================================
ALTER TABLE settlement_expense_items ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;
ALTER TABLE settlement_expense_items ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE settlement_income_items ADD COLUMN IF NOT EXISTS note text;
