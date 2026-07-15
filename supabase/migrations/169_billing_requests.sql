-- ============================================================
-- 169_billing_requests.sql
-- 請求の「確認依頼／返金依頼」ワークフロー。既存 payment_check_requests を拡張。
--   kind=confirm … 経理→受注/管理 の確認依頼（過入金/不備の確認。既存互換の既定値）
--   kind=refund  … 受注/管理→経理 の返金依頼（要返金リスト）
-- 返金確定は従来どおり payments に is_refund のマイナス行を作り、依頼を確認済にする。
-- ============================================================
ALTER TABLE payment_check_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'confirm',   -- confirm / refund
  ADD COLUMN IF NOT EXISTS reason_category text,                   -- 返金理由（過入金/業務量減/解約/その他）
  ADD COLUMN IF NOT EXISTS fee_bearer text,                        -- 手数料負担 customer / self
  ADD COLUMN IF NOT EXISTS refund_amount numeric;                  -- 返金希望額（円）

CREATE INDEX IF NOT EXISTS idx_payment_check_requests_kind_status
  ON payment_check_requests(kind, status, requested_date DESC);
