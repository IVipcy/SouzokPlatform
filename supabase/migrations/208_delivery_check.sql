-- 納品タブの Wチェック(ピア確認) 列を 受信簿(items)/契約手続き 両テーブルに追加。
-- 依頼制ではなく「自分以外の任意メンバーがハンコを押す」だけ(確認簿と同じテイスト)。

ALTER TABLE document_receipt_items
  ADD COLUMN IF NOT EXISTS delivery_check_by uuid REFERENCES members(id),
  ADD COLUMN IF NOT EXISTS delivery_check_at timestamptz;

ALTER TABLE contract_documents
  ADD COLUMN IF NOT EXISTS delivery_check_by uuid REFERENCES members(id),
  ADD COLUMN IF NOT EXISTS delivery_check_at timestamptz;
