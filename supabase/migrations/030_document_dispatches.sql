-- ============================================================
-- 030_document_dispatches.sql
-- 書類発着管理簿（どの書類をいつどこに送り、いつ届いたかの記録）
--
-- 用途:
--   - 案件詳細「郵送管理」タブで案件単位の発着履歴を管理
--   - 上位タブ「書類発着管理簿」で全案件横断の発着簿を表示
-- ============================================================

CREATE TABLE IF NOT EXISTS document_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,

  -- 発送情報
  document_name      TEXT NOT NULL,           -- 書類名（戸籍謄本 / 住民票 / その他自由入力）
  sent_date          DATE,                    -- 発送日
  sent_to            TEXT,                    -- 発送先（自由入力）
  quantity           INTEGER DEFAULT 1 CHECK (quantity >= 0),  -- 通数

  -- 受領情報
  received_date      TEXT,                    -- 届いた日付（YYYY-MM-DD or 自由テキスト）
  received_file_path TEXT,                    -- Storage 内パス（dispatch-documents バケット）
  received_file_name TEXT,                    -- 元ファイル名
  received_file_type TEXT,                    -- MIME

  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_dispatches_case_sent
  ON document_dispatches(case_id, sent_date DESC);

ALTER TABLE document_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_dispatches_select" ON document_dispatches;
CREATE POLICY "document_dispatches_select" ON document_dispatches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "document_dispatches_modify" ON document_dispatches;
CREATE POLICY "document_dispatches_modify" ON document_dispatches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_document_dispatches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_dispatches_updated_at ON document_dispatches;
CREATE TRIGGER document_dispatches_updated_at
  BEFORE UPDATE ON document_dispatches
  FOR EACH ROW EXECUTE FUNCTION update_document_dispatches_updated_at();
