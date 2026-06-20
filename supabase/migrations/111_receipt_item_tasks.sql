-- 到着物(document_receipt_items) ↔ タスク(tasks) の多対多。
-- 1受信に複数の到着物があり、各到着物が別々のタスクに効く（例: 銀行の受信で
-- 残高証明→財産調査タスク、解約書類→解約タスク）。1到着物→複数タスクも可。
-- 受信簿の「タスクに着手」で到着物ごとに結んだタスクを記録し、各タブの関連タスク列に表示する。

CREATE TABLE IF NOT EXISTS document_receipt_item_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_item_id uuid NOT NULL REFERENCES document_receipt_items(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_item_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_drit_item ON document_receipt_item_tasks(receipt_item_id);
CREATE INDEX IF NOT EXISTS idx_drit_task ON document_receipt_item_tasks(task_id);

ALTER TABLE document_receipt_item_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_receipt_item_tasks_all ON document_receipt_item_tasks;
CREATE POLICY document_receipt_item_tasks_all ON document_receipt_item_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 既存の started_task_id（受信単位の1タスク）を、その受信の各到着物に引き継ぐ（表示を壊さない）。
INSERT INTO document_receipt_item_tasks (receipt_item_id, task_id)
SELECT i.id, r.started_task_id
  FROM document_receipts r
  JOIN document_receipt_items i ON i.receipt_id = r.id
 WHERE r.started_task_id IS NOT NULL
ON CONFLICT (receipt_item_id, task_id) DO NOTHING;
