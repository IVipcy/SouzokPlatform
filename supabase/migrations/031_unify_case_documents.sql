-- ============================================================
-- 031_unify_case_documents.sql
-- 「書類」と「書類発着管理簿」を統一する。
--   document_dispatches テーブルを拡張して
--   - 自社控え（outbound_file_*）
--   - AI/手動アップロード書類との統合（task_id, generated_by）
--   - 受領ファイルの保管バケット記録（received_file_bucket）
--   を追加し、最終的に case_documents にリネームする。
--
-- 既存 documents テーブルのデータも case_documents に移行
-- （documents テーブル自体は念のため残す。後続の migration で drop 予定）。
-- ============================================================

-- 1. 新カラム追加
ALTER TABLE document_dispatches
  ADD COLUMN IF NOT EXISTS task_id              UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outbound_file_path   TEXT,
  ADD COLUMN IF NOT EXISTS outbound_file_name   TEXT,
  ADD COLUMN IF NOT EXISTS outbound_file_type   TEXT,
  ADD COLUMN IF NOT EXISTS outbound_file_bucket TEXT,
  ADD COLUMN IF NOT EXISTS received_file_bucket TEXT,
  ADD COLUMN IF NOT EXISTS generated_by         TEXT;

-- 2. 既存の received_file_path は dispatch-documents バケットに保存済みなのでマーク
UPDATE document_dispatches
SET received_file_bucket = 'dispatch-documents'
WHERE received_file_path IS NOT NULL AND received_file_bucket IS NULL;

-- 3. documents テーブルから移行
--    （AI生成や手動アップロード書類を outbound として登録）
INSERT INTO document_dispatches (
  case_id, document_name, task_id,
  outbound_file_path, outbound_file_name, outbound_file_type, outbound_file_bucket,
  generated_by, created_at, updated_at
)
SELECT
  case_id,
  name,
  task_id,
  file_path,
  name,
  file_type,
  'documents',
  generated_by,
  created_at,
  updated_at
FROM documents
WHERE NOT EXISTS (
  SELECT 1 FROM document_dispatches dd
  WHERE dd.case_id = documents.case_id
    AND dd.document_name = documents.name
    AND dd.created_at = documents.created_at
);

-- 4. テーブル名をリネーム
ALTER TABLE document_dispatches RENAME TO case_documents;

-- 5. 既存インデックスのリネーム
ALTER INDEX IF EXISTS idx_document_dispatches_case_sent
  RENAME TO idx_case_documents_case_sent;

-- 6. ポリシーは古い名前のままなので drop + create
DROP POLICY IF EXISTS "document_dispatches_select" ON case_documents;
DROP POLICY IF EXISTS "document_dispatches_modify" ON case_documents;
DROP POLICY IF EXISTS "case_documents_select" ON case_documents;
DROP POLICY IF EXISTS "case_documents_modify" ON case_documents;

CREATE POLICY "case_documents_select" ON case_documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "case_documents_modify" ON case_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. updated_at トリガー: 既存ならリネーム
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'document_dispatches_updated_at'
  ) THEN
    ALTER TRIGGER document_dispatches_updated_at ON case_documents
      RENAME TO case_documents_updated_at;
  END IF;
END $$;

-- 8. 受領書類用の追加インデックス（返送待ちの絞り込み高速化）
CREATE INDEX IF NOT EXISTS idx_case_documents_sent_waiting
  ON case_documents(case_id)
  WHERE sent_date IS NOT NULL AND received_date IS NULL;

-- 9. documents テーブルは現時点では残す。
--    アプリ側の参照が消えたら別 migration で DROP 予定。
