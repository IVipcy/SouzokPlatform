-- ============================================================
-- 168_unmatched_deposits.sql
-- 銀行CSV突合の④「CSVにあり・システムに該当なし」。
-- どの入金待ち請求にも突合できなかった入金を保存し、後から人が
-- 「請求に紐付け（linked）」または「対象外（dismissed）」で個別処理する。
-- 再取込での二重登録は dedup_key（日付+金額+名義+摘要）で排除。
-- ============================================================
CREATE TABLE IF NOT EXISTS unmatched_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_name text,                 -- 振込名義人（CSVの名義そのまま）
  amount numeric NOT NULL,         -- 入金額
  deposit_date date,               -- 入金日（CSVの取引日）
  memo text,                       -- 摘要
  source_file text,                -- 取込CSVファイル名
  dedup_key text,                  -- 二重取込防止キー（日付+金額+名義+摘要）
  status text NOT NULL DEFAULT 'open',   -- open=未処理 / linked=請求に紐付け済 / dismissed=対象外
  linked_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,  -- 紐付け先の請求
  resolved_note text,              -- 対象外理由・紐付けメモ
  resolved_by uuid REFERENCES members(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unmatched_deposits_status ON unmatched_deposits(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_unmatched_deposits_dedup ON unmatched_deposits(dedup_key) WHERE dedup_key IS NOT NULL;
