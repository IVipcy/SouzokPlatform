-- ============================================================
-- 172_sales_report_fields.sql
-- 確定売上表レポート（独自Excel）出力の土台。
--   invoices.posted_date … 計上日（請求書確認後に経理が計上した日。売上表A列。発行日とは別）
--   payments.bank         … 入金経路（みずほ/きらぼし 等）。CSV突合で自動記録＋手入金消込で選択。
--                           売上表のシート分け（銀行別）に使う。
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS posted_date date;   -- 計上日

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bank text;          -- 入金経路（銀行）

-- 売上表のシート＝「営業部 × 銀行」。チームに営業部と入金銀行を持たせる。
--   division … 営業部（例: 第一営業部 / 第二営業部）。チームの上位グループ。
--   bank     … その営業部/チームの入金銀行（例: みずほ / きらぼし）。
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS bank text;

CREATE INDEX IF NOT EXISTS idx_invoices_posted_date ON invoices(posted_date);
