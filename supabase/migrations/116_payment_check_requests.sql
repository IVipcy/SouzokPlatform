-- 入金状況の確認依頼（経理/管理担当 → 受注担当）。進捗報告(progress_reports)の双子だが
-- 請求書(invoice)単位で紐付ける点が違う。受注担当が入金確認＆お客様連絡をして、結果を
-- result_note に書いて「確認済」にすると、依頼者(経理/管理担当)へ通知が返る。
-- CSV突合/入金消込でその請求が入金確定したら、開いている依頼を自動で確認済にする（auto_closed）。

CREATE TABLE IF NOT EXISTS payment_check_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  requester_id   uuid NOT NULL REFERENCES members(id),  -- 依頼した経理/管理担当
  confirmer_id   uuid NOT NULL REFERENCES members(id),  -- 確認する受注担当
  status         text NOT NULL DEFAULT '依頼中',         -- 依頼中 / 確認済
  result_note    text,                                   -- 受注担当が入れる確認結果（経理が請求タブで読む）
  requested_date date NOT NULL DEFAULT CURRENT_DATE,
  confirmed_date date,
  auto_closed    boolean NOT NULL DEFAULT false,         -- 入金突合で自動的に確認済になったか
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  payment_check_requests IS '入金状況の確認依頼（経理/管理担当→受注担当）。請求書単位。';
COMMENT ON COLUMN payment_check_requests.result_note IS '受注担当が入力する確認結果（例: 12/15に○○銀行から振込済と確認）。';
COMMENT ON COLUMN payment_check_requests.auto_closed IS '入金突合/消込で自動的に確認済化したか。';

CREATE INDEX IF NOT EXISTS idx_pcr_invoice   ON payment_check_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pcr_confirmer ON payment_check_requests(confirmer_id);
CREATE INDEX IF NOT EXISTS idx_pcr_requester ON payment_check_requests(requester_id);

ALTER TABLE payment_check_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_check_requests_all ON payment_check_requests;
CREATE POLICY payment_check_requests_all ON payment_check_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS payment_check_requests_updated_at ON payment_check_requests;
CREATE TRIGGER payment_check_requests_updated_at
  BEFORE UPDATE ON payment_check_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
