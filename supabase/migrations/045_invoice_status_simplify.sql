-- ============================================================
-- 045_invoice_status_simplify.sql
-- 請求書ステータスを 4種類 (未請求 / 作成済 / 入金待ち / 入金済) に統一。
--
-- 旧: 未請求 / 作成済 / 前受金請求済 / 前受金入金済 / 確定請求済 / 入金済 / 一部入金
-- 新: 未請求 / 作成済 / 入金待ち / 入金済
--
-- 「前受金 / 確定請求」の区別は invoice_type 列で持つ。
-- ステータスはお金の動きだけを表現するシンプルな3+1段階に。
-- ============================================================

-- 1) 既存データのマッピング
UPDATE invoices SET status = '入金待ち'
  WHERE status IN ('前受金請求済', '確定請求済', '一部入金');

UPDATE invoices SET status = '入金済'
  WHERE status = '前受金入金済';

-- 2) CHECK 制約を新4種類で再作成
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check CHECK (
    status IN ('未請求', '作成済', '入金待ち', '入金済')
  );
