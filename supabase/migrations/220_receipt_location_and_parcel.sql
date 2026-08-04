-- ============================================================
-- 220_receipt_location_and_parcel.sql
-- 到着物受信簿の拠点別管理＋「受注/管理宛の郵送物一式」受付フロー用の列。
--   location            : 拠点（共同ビル / クレアトール / 藤沢）。受信簿を拠点別に管理。
--   is_parcel           : 受注/管理宛の郵送物を「一式」で仮登録したレコード（中身未開封）。
--   arrival_notified_at : 「到着連絡」を飛ばした日時（アラート＋開封タスク生成済みの印）。
--   opened_at           : 受注/管理が開封して中身を本登録し直した日時。
-- ============================================================

ALTER TABLE document_receipts
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS is_parcel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arrival_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;
