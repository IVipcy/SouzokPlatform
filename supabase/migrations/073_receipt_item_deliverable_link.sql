-- ============================================================
-- 073_receipt_item_deliverable_link.sql
-- 書類受信簿の到着物(item)を「取得物(deliverable)」に任意リンク（追加のみ・非破壊）
--   linked_kind   'financial_asset' | 'real_estate' | null
--   linked_id     financial_assets.id もしくは real_estate_properties.id
--   linked_field  受領日を書き込む対象カラム名
--                 （例: arrival_date / cancellation_arrival_date /
--                       registry_receipt_date / cadastral_receipt_date 等）
-- リンクして受領を登録すると、対象取得物の受領日カラムに received_date を反映する。
-- ============================================================

ALTER TABLE document_receipt_items ADD COLUMN IF NOT EXISTS linked_kind TEXT;
ALTER TABLE document_receipt_items ADD COLUMN IF NOT EXISTS linked_id UUID;
ALTER TABLE document_receipt_items ADD COLUMN IF NOT EXISTS linked_field TEXT;
