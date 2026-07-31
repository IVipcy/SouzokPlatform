-- 納品対象フラグ delivery_target を 3値(未選択/対象/対象外)にする。
--   これまで NOT NULL DEFAULT false だったため、新規書類が常に false=「対象外」として
--   納品タブに現れていた（お客様預かり書類を追加した瞬間に対象外になる不具合）。
--   nullable + DEFAULT NULL にして「未選択」スタートにする。
--     null  = 未選択（納品タブで 対象/対象外 を選ぶ）
--     true  = 対象
--     false = 対象外
--   既存の false は「既定で入っただけ」と「明示的に対象外にした」の区別ができないが、
--   納品機能は新しく実データが少ないため、false は 未選択(null) に巻き戻す。true(対象)は保持。

ALTER TABLE contract_documents ALTER COLUMN delivery_target DROP NOT NULL;
ALTER TABLE contract_documents ALTER COLUMN delivery_target SET DEFAULT NULL;
UPDATE contract_documents SET delivery_target = NULL WHERE delivery_target = false;

ALTER TABLE document_receipt_items ALTER COLUMN delivery_target DROP NOT NULL;
ALTER TABLE document_receipt_items ALTER COLUMN delivery_target SET DEFAULT NULL;
UPDATE document_receipt_items SET delivery_target = NULL WHERE delivery_target = false;
