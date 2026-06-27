-- ============================================================
-- 137_case_files_and_upload_flag.sql
-- 添付書類を「案件1フォルダにまとめてアップ」方式にするための土台。
--   - case_files: 案件ごとのフォルダに放り込んだファイル（到着物ごとの紐づけ不要）
--   - document_receipt_items.uploaded_at: 受信簿アイテムが共有フォルダにアップ済かの手動フラグ
--     （旧「未添付」バッジを「アップ済 / 未アップ」に置き換える）
-- ============================================================

-- 案件フォルダのファイル（実体は storage の documents バケット `案件ID/folder/...`）
CREATE TABLE IF NOT EXISTS case_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_bucket TEXT NOT NULL DEFAULT 'documents',
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_files_case ON case_files(case_id, created_at DESC);

ALTER TABLE case_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_files_all ON case_files;
CREATE POLICY case_files_all ON case_files
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 受信簿アイテムの「共有フォルダにアップ済」フラグ（手動チェック）
ALTER TABLE document_receipt_items ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;
