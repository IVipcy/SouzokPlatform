-- 納品タブ運用のための列追加。
--   cases.delivery_status: 案件レベルの納品ステータス
--     '準備中'       : 対象書類の選定中（初期値）
--     '確認申請中'   : 受注担当に確認依頼を送った状態（progress_reports.kind='delivery_confirm' insert 済）
--     '納品待ち'     : 受注担当が承認済み。実際の納品はこれから
--     '納品済'       : 実物を納品済（管理担当が「納品済にする」ボタンを押下）
--
--   document_receipt_items.delivery_target: 受信簿の個別書類が納品対象か
--     デフォルト false（明示的に「対象」に切り替えないと納品タブ上で対象扱いにしない）

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS delivery_status text
    CHECK (delivery_status IN ('準備中','確認申請中','納品待ち','納品済'));
-- 既定値は入れない(NULL=準備中扱い)。cases.status='納品完了' で delivery_status='納品済' 想定。

ALTER TABLE document_receipt_items
  ADD COLUMN IF NOT EXISTS delivery_target boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_document_receipt_items_delivery_target ON document_receipt_items(delivery_target);
