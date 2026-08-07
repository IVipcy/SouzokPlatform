-- ============================================================
-- 230_delivery_recipient.sql
-- 納品物ごとの「受領先（相続人）」。
--
-- 返却する原本の宛先が相続人ごとに分かれることがある
-- （権利証は長男へ、印鑑登録証明書は本人へ 等）。
-- これまで原本受領証は案件で1名を選んで1通だけ作る作りだったので、
-- 書類ごとに受領先を持てるようにする。
--
-- 未設定の行は「共通」扱い。どの受領先の受領証にも載せる。
-- （全部未設定なら、これまでと同じく全書類が1通に載る）
-- ============================================================

ALTER TABLE document_receipt_items ADD COLUMN IF NOT EXISTS delivery_recipient_heir_id uuid REFERENCES heirs(id) ON DELETE SET NULL;
ALTER TABLE contract_documents      ADD COLUMN IF NOT EXISTS delivery_recipient_heir_id uuid REFERENCES heirs(id) ON DELETE SET NULL;

COMMENT ON COLUMN document_receipt_items.delivery_recipient_heir_id IS '納品物の受領先（相続人）。未設定は共通＝どの受領証にも載せる。';
COMMENT ON COLUMN contract_documents.delivery_recipient_heir_id     IS '納品物の受領先（相続人）。未設定は共通＝どの受領証にも載せる。';

NOTIFY pgrst, 'reload schema';
