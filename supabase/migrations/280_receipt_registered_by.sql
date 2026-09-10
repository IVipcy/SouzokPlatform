-- 到着物受信簿：W-Check（受信確定）を廃止し「登録者」を自動記録する（2026-09-10）
--
-- ・registered_by_member_id … 受信を登録した人。登録時に自動で入る（押すものは無い）。
-- ・dual_check_* の列は残す（過去の記録。画面では使わない）。
-- ・受信簿の「対応」から作った読込タスクに、到着物の結び先（戸籍請求ID など）を source_rid として
--   持たせる。過去に作ったタスクで source_rid が空のものは、到着物の結び先から埋め直す。

ALTER TABLE document_receipts ADD COLUMN IF NOT EXISTS registered_by_member_id uuid REFERENCES members(id);
COMMENT ON COLUMN document_receipts.registered_by_member_id IS '受信を登録した人（自動記録）';

-- 過去分：W-Check を押した人がいればその人を登録者とみなす（一番近い記録）
UPDATE document_receipts SET registered_by_member_id = dual_check_member_id
 WHERE registered_by_member_id IS NULL AND dual_check_member_id IS NOT NULL;

-- 過去に受信簿から作ったタスクの着地先を埋める（source_rid が空のものだけ）
-- 戸籍 → koseki-read:{請求ID}
UPDATE tasks t SET source_rid = 'koseki-read:' || i.linked_id
  FROM document_receipt_item_tasks j
  JOIN document_receipt_items i ON i.id = j.receipt_item_id
 WHERE j.task_id = t.id AND t.source_rid IS NULL
   AND i.linked_kind = 'koseki' AND i.linked_id IS NOT NULL;

-- 金融資産 → fin-read:{金融機関名}
UPDATE tasks t SET source_rid = 'fin-read:' || fa.institution_name
  FROM document_receipt_item_tasks j
  JOIN document_receipt_items i ON i.id = j.receipt_item_id
  JOIN financial_assets fa ON fa.id::text = i.linked_id
 WHERE j.task_id = t.id AND t.source_rid IS NULL
   AND i.linked_kind = 'financial_asset' AND fa.institution_name IS NOT NULL AND fa.institution_name <> '';

-- 不動産の取得資料（市区町村へ請求したもの） → re-muni-read:{市区町村}
UPDATE tasks t SET source_rid = 're-muni-read:' || a.target_municipality
  FROM document_receipt_item_tasks j
  JOIN document_receipt_items i ON i.id = j.receipt_item_id
  JOIN real_estate_acquisitions a ON a.id::text = i.linked_id
 WHERE j.task_id = t.id AND t.source_rid IS NULL
   AND i.linked_kind = 'real_estate_acquisition' AND a.target_municipality IS NOT NULL AND a.target_municipality <> '';

-- 確認：
-- SELECT count(*) FROM document_receipts WHERE registered_by_member_id IS NOT NULL;
-- SELECT t.id, t.title, t.source_rid FROM tasks t JOIN document_receipt_item_tasks j ON j.task_id = t.id ORDER BY t.created_at DESC LIMIT 20;
