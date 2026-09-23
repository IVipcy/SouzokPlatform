-- ============================================================
-- 298_billing_expense_billed_invoice.sql
-- 請求タブの立替実費（billing_expense_items）に「どの請求書で請求済みか」を持たせる。
--   ・/billing の請求書発行モーダルの立替実費の出どころを billing_expense_items に統一するため
--     （旧 expenses.billed_invoice_id と同じ考え方）。
--   ・請求済み（billed_invoice_id あり）の行は「実務タブから取り込み」で作り直さない。
--   ・確定売上表で同じ案件に売上請求書が複数あるとき、請求書ごとの課税/非課税を出す紐づけに使う。
-- ============================================================
ALTER TABLE billing_expense_items
  ADD COLUMN IF NOT EXISTS billed_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_billing_expense_items_billed
  ON billing_expense_items(billed_invoice_id)
  WHERE billed_invoice_id IS NOT NULL;

-- 確認: select column_name from information_schema.columns where table_name='billing_expense_items' and column_name='billed_invoice_id';
