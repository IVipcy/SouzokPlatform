-- 遺産分割協議書の送付・受領管理。
-- 「協議書の送付・調印 = OCから各相続人へ」のとき、各相続人へ協議書を送付し
-- 署名・押印して返送（受領）してもらう進捗を相続人単位で管理する。
-- 1行＝1相続人。heir_id で相続人に紐づけ、案件×相続人で一意。

CREATE TABLE IF NOT EXISTS agreement_dispatches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  heir_id       uuid REFERENCES heirs(id) ON DELETE CASCADE,
  sent_date     date,        -- 送付日
  received_date date,        -- 返送（受領）日
  received      boolean NOT NULL DEFAULT false,  -- 受領済（署名・押印済が返送された）
  notes         text,        -- 備考
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, heir_id)
);

COMMENT ON TABLE  agreement_dispatches IS '遺産分割協議書の送付・受領状況（相続人単位）';
COMMENT ON COLUMN agreement_dispatches.sent_date     IS '協議書の送付日';
COMMENT ON COLUMN agreement_dispatches.received_date IS '協議書の返送（受領）日';
COMMENT ON COLUMN agreement_dispatches.received      IS '受領済（署名・押印済の返送を確認）';

CREATE INDEX IF NOT EXISTS idx_agreement_dispatches_case ON agreement_dispatches(case_id);

ALTER TABLE agreement_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agreement_dispatches_all ON agreement_dispatches;
CREATE POLICY agreement_dispatches_all ON agreement_dispatches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS agreement_dispatches_updated_at ON agreement_dispatches;
CREATE TRIGGER agreement_dispatches_updated_at
  BEFORE UPDATE ON agreement_dispatches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
