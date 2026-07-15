-- ============================================================
-- 171_billing_request_resolution.sql
-- 確認依頼（過入金など）への回答判定。受注/管理が回答時に選ぶ「返金OKフラグ」相当。
--   confirm_ok  … 入金確定でOK
--   need_refund … 要返金（経理が返金へ）
--   hold        … 保留（追加確認）
-- 返金依頼(kind=refund)は依頼自体が返金承認なので resolution は使わない。
-- ============================================================
ALTER TABLE payment_check_requests
  ADD COLUMN IF NOT EXISTS resolution text;   -- confirm_ok / need_refund / hold（確認依頼の回答判定）
