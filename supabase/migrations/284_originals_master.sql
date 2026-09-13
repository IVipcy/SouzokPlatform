-- 284: 原本管理を親にする（2026-09-14）
--
-- 原本預かり証・納品タブ・原本受領証は、原本管理の行（契約時受領書類＋受信簿の到着物＋手で足した原本）をチェックして選ぶ。
-- そのため納品タブが contract_documents / document_receipt_items に持っていた delivery_* を原本管理の手直し表（original_doc_overrides）へ移し、
-- 「預かり証に載せた日」「受領証に載せた日」も同じ行に持つ。
-- 旧列（contract_documents.delivery_* / document_receipt_items.delivery_*）は残すが、画面はもう使わない。

ALTER TABLE original_doc_overrides
  ADD COLUMN IF NOT EXISTS delivery_target boolean,                                   -- 納品：true=対象 / false=対象外 / null=未選択
  ADD COLUMN IF NOT EXISTS delivery_check_by uuid REFERENCES members(id),
  ADD COLUMN IF NOT EXISTS delivery_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_recipient_heir_id uuid REFERENCES heirs(id) ON DELETE SET NULL,  -- 受領先（null=共通）
  ADD COLUMN IF NOT EXISTS delivery_display_name text,                                -- 受領証に載せる名前（納品タブ限定）
  ADD COLUMN IF NOT EXISTS delivery_touki_notice_date text,
  ADD COLUMN IF NOT EXISTS delivery_touki_notice_number text,
  ADD COLUMN IF NOT EXISTS delivery_inkan_client_names text[],
  ADD COLUMN IF NOT EXISTS azukari_issued_on date,                                    -- 原本預かり証に載せた日
  ADD COLUMN IF NOT EXISTS juryosho_issued_on date;                                   -- 原本受領証に載せた日
COMMENT ON COLUMN original_doc_overrides.delivery_target IS '納品タブ：true=対象／false=対象外／null=未選択（migration 284 で contract_documents / document_receipt_items から移した）';
COMMENT ON COLUMN original_doc_overrides.azukari_issued_on IS '原本預かり証に載せた日';
COMMENT ON COLUMN original_doc_overrides.juryosho_issued_on IS '原本受領証に載せた日';

-- 移行：契約時受領書類（お客様預かり書類）の納品タブの値
INSERT INTO original_doc_overrides (case_id, stock_key, delivery_target, delivery_check_by, delivery_check_at, delivery_recipient_heir_id, delivery_display_name, delivery_touki_notice_date, delivery_touki_notice_number, delivery_inkan_client_names)
SELECT d.case_id, 'contract:' || d.id, d.delivery_target, d.delivery_check_by, d.delivery_check_at, d.delivery_recipient_heir_id, d.delivery_display_name, d.delivery_touki_notice_date, d.delivery_touki_notice_number, d.delivery_inkan_client_names
  FROM contract_documents d
 WHERE d.delivery_target IS NOT NULL OR d.delivery_check_at IS NOT NULL OR d.delivery_recipient_heir_id IS NOT NULL
    OR d.delivery_display_name IS NOT NULL OR d.delivery_touki_notice_date IS NOT NULL OR d.delivery_touki_notice_number IS NOT NULL OR d.delivery_inkan_client_names IS NOT NULL
ON CONFLICT (case_id, stock_key) DO UPDATE SET
  delivery_target = EXCLUDED.delivery_target, delivery_check_by = EXCLUDED.delivery_check_by, delivery_check_at = EXCLUDED.delivery_check_at,
  delivery_recipient_heir_id = EXCLUDED.delivery_recipient_heir_id, delivery_display_name = EXCLUDED.delivery_display_name,
  delivery_touki_notice_date = EXCLUDED.delivery_touki_notice_date, delivery_touki_notice_number = EXCLUDED.delivery_touki_notice_number,
  delivery_inkan_client_names = EXCLUDED.delivery_inkan_client_names, updated_at = now();

-- 移行：受信簿の到着物の納品タブの値
INSERT INTO original_doc_overrides (case_id, stock_key, delivery_target, delivery_check_by, delivery_check_at, delivery_recipient_heir_id, delivery_display_name, delivery_touki_notice_date, delivery_touki_notice_number, delivery_inkan_client_names)
SELECT r.case_id, 'receipt:' || i.id, i.delivery_target, i.delivery_check_by, i.delivery_check_at, i.delivery_recipient_heir_id, i.delivery_display_name, i.delivery_touki_notice_date, i.delivery_touki_notice_number, i.delivery_inkan_client_names
  FROM document_receipt_items i JOIN document_receipts r ON r.id = i.receipt_id
 WHERE i.delivery_target IS NOT NULL OR i.delivery_check_at IS NOT NULL OR i.delivery_recipient_heir_id IS NOT NULL
    OR i.delivery_display_name IS NOT NULL OR i.delivery_touki_notice_date IS NOT NULL OR i.delivery_touki_notice_number IS NOT NULL OR i.delivery_inkan_client_names IS NOT NULL
ON CONFLICT (case_id, stock_key) DO UPDATE SET
  delivery_target = EXCLUDED.delivery_target, delivery_check_by = EXCLUDED.delivery_check_by, delivery_check_at = EXCLUDED.delivery_check_at,
  delivery_recipient_heir_id = EXCLUDED.delivery_recipient_heir_id, delivery_display_name = EXCLUDED.delivery_display_name,
  delivery_touki_notice_date = EXCLUDED.delivery_touki_notice_date, delivery_touki_notice_number = EXCLUDED.delivery_touki_notice_number,
  delivery_inkan_client_names = EXCLUDED.delivery_inkan_client_names, updated_at = now();

-- 納品済の案件は、対象にしていた原本を「返却・納品済」に（手元 0）。数は受領数（契約時受領=1、到着物=通数）
UPDATE original_doc_overrides o SET delivered_qty = GREATEST(o.delivered_qty, 1), delivered_on = COALESCE(o.delivered_on, c.completion_date)
  FROM cases c
 WHERE o.case_id = c.id AND c.delivery_status = '納品済' AND o.delivery_target = true AND o.stock_key LIKE 'contract:%';
UPDATE original_doc_overrides o SET delivered_qty = GREATEST(o.delivered_qty, COALESCE(i.quantity, 1)), delivered_on = COALESCE(o.delivered_on, c.completion_date)
  FROM cases c, document_receipt_items i
 WHERE o.case_id = c.id AND c.delivery_status = '納品済' AND o.delivery_target = true AND o.stock_key = 'receipt:' || i.id;

NOTIFY pgrst, 'reload schema';

-- 確認：
-- SELECT count(*) FROM original_doc_overrides WHERE delivery_target IS NOT NULL;
