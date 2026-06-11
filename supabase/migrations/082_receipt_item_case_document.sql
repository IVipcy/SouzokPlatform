-- ============================================================
-- 082_receipt_item_case_document.sql
-- 受信管理簿の到着物(item)を、書類(case_documents)の受領書類レコードに紐づける。
-- 受信簿で受領した物はすべて書類タブにも「受領書類」として残す（PDF保管を一本化）。
-- ============================================================

ALTER TABLE document_receipt_items
  ADD COLUMN IF NOT EXISTS case_document_id UUID REFERENCES case_documents(id) ON DELETE SET NULL;
