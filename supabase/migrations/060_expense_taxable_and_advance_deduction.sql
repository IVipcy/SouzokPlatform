-- ============================================================
-- 060_expense_taxable_and_advance_deduction.sql
-- 確定請求書の精緻化（インボイス対応）
--   1. expenses.taxable: 立替実費の課税/非課税区分（true=課税）。
--      適格請求書で「10%対象額・内消費税」を正しく出すため。
--      官公署手数料・印紙は非課税、その他は課税を既定とする（運用で1件ずつ上書き可）。
--   2. invoices.advance_deduction: 確定請求書での前受金控除額（円）。
--      着手時に受領した前受金を差し引き、二重請求を防ぐ。
-- ============================================================

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS taxable BOOLEAN;

-- 既定の課税区分を費目から補完（官公署手数料・印紙＝非課税）
UPDATE expenses SET taxable = CASE
  WHEN category IN ('戸籍取得費', '登記印紙代', '登記情報取得費', '公図取得費', '評価証明取得費') THEN false
  ELSE true
END
WHERE taxable IS NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS advance_deduction BIGINT NOT NULL DEFAULT 0;
