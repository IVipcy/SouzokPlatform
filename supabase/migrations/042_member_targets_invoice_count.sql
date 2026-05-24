-- ============================================================
-- 042_member_targets_invoice_count.sql
-- 既存 member_targets テーブルに invoice_count 列を追加。
-- 管理担当の月間「発行請求件数」目標を保存するために使う。
--
-- 既存の new_orders_count は受注担当の月間「新規受注件数」目標。
-- ============================================================

ALTER TABLE member_targets
  ADD COLUMN IF NOT EXISTS invoice_count INT NOT NULL DEFAULT 0;
