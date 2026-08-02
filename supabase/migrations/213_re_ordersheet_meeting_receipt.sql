-- ============================================================
-- 213_re_ordersheet_meeting_receipt.sql
-- オーダーシート＞財産調査(不動産) の市区町村ブロック再編に伴う列追加。
--   ・名寄帳／固定資産評価証明 を市区町村単位の real_estate_acquisitions 行に統一
--     （評価証明も名寄帳と同じ「取得区分/所在地/年度/面談時に受領✓/備考/追加」仕様に）。
--   ・面談時に受領✓ を保存すると、契約手続きタブの書類に「受領済・受領日入り」で自動追加する。
--     その追加した contract_documents 行を contract_document_id で紐付け（✓解除時に削除・重複防止）。
-- ============================================================

-- 面談時に受領✓（名寄帳・評価証明の行）
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS received_at_meeting boolean NOT NULL DEFAULT false;

-- 名寄帳/評価証明 共通の年度（和暦文字列。既存 myna_year を汎用の doc_year に寄せる）
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS doc_year text;
UPDATE real_estate_acquisitions SET doc_year = myna_year WHERE doc_year IS NULL AND myna_year IS NOT NULL;

-- 面談時受領✓で契約手続きタブに自動追加した書類の紐付け（✓解除で削除・重複防止）
ALTER TABLE real_estate_acquisitions
  ADD COLUMN IF NOT EXISTS contract_document_id uuid REFERENCES contract_documents(id) ON DELETE SET NULL;

-- PostgREST schema cache をリロード
NOTIFY pgrst, 'reload schema';
