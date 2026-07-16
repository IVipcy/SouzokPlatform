-- ============================================================
-- 174_invoice_expense_deduction.sql
-- 立替実費差引額（売上表 L/M/N列）。
-- 立て替えた実費のうち「今回の請求から差し引く分」（相殺済み等）。
-- 差引請求額 = 合計 −（前受金 + 差引実費）で使う。確定請求invoice単位で保持。
--   deduct_expense_nontax … 差引実費 非課税分（L列）
--   deduct_expense_tax    … 差引実費 課税分(税込)（M列）  ※差引計 N = L + M
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deduct_expense_nontax BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduct_expense_tax    BIGINT NOT NULL DEFAULT 0;
