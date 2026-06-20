-- 受信簿で受信をトリガーに着手/作成したタスクを受信簿に紐付ける。
-- 各タブの書類一覧（戸籍請求一覧 等）から「関連タスク」へ飛べるようにするためのリンク。
ALTER TABLE document_receipts
  ADD COLUMN IF NOT EXISTS started_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN document_receipts.started_task_id IS '受信をトリガーに着手/作成したタスク（関連タスク列のリンク先）';

CREATE INDEX IF NOT EXISTS idx_document_receipts_started_task ON document_receipts(started_task_id);
