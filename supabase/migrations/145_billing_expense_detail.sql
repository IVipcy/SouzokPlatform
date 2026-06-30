-- 立替実費（請求タブ）を 課税/非課税・数量・単価 で管理できるよう拡張。
-- 金額は 数量×単価（空欄なら amount 直接）。shigyo(司法/行政)・label・amount は既存。
ALTER TABLE billing_expense_items
  ADD COLUMN IF NOT EXISTS taxable boolean NOT NULL DEFAULT false,  -- 課税=true / 非課税=false
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS note text;
