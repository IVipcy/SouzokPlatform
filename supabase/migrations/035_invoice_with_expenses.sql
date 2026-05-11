-- ============================================================
-- 035_invoice_with_expenses.sql
-- 請求書に立替実費を組み込む。
--
-- 変更点:
--   1. invoices に fee_amount / expenses_amount カラム追加
--      （内訳: 報酬 + 立替実費 = amount）
--   2. expenses に billed_invoice_id 追加
--      （どの請求書で請求済みかを追跡 / 重複請求防止）
--
-- 既存データはすべて「報酬のみ」の請求書と見做し、
-- fee_amount = amount, expenses_amount = 0 で backfill。
-- ============================================================

-- 1. invoices に内訳カラム追加
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS fee_amount      BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expenses_amount BIGINT DEFAULT 0;

-- 2. 既存 invoices の backfill: amount を fee_amount に転記
--    (既に fee_amount に値が入っている場合は触らない)
UPDATE invoices
SET fee_amount = amount,
    expenses_amount = 0
WHERE fee_amount IS NULL OR fee_amount = 0;

-- 3. expenses に「どの請求書で請求済みか」追跡カラム追加
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS billed_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- 4. インデックス
CREATE INDEX IF NOT EXISTS idx_expenses_billed_invoice
  ON expenses(billed_invoice_id)
  WHERE billed_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_unbilled
  ON expenses(case_id)
  WHERE billed_invoice_id IS NULL;
