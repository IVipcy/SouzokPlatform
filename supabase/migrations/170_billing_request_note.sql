-- ============================================================
-- 170_billing_request_note.sql
-- 確認依頼／返金依頼の「依頼内容（依頼者が書く本文）」列を追加。
-- result_note は回答（確認結果）用なので、依頼本文は request_note に持たせる。
-- 返金依頼は経理チーム宛（単一の確認者がいない）ため confirmer_id を NULL 許容に。
-- ============================================================
ALTER TABLE payment_check_requests
  ADD COLUMN IF NOT EXISTS request_note text;   -- 依頼者が書く確認/返金の依頼本文

ALTER TABLE payment_check_requests
  ALTER COLUMN confirmer_id DROP NOT NULL;
