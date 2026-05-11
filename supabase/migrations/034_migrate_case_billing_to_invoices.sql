-- ============================================================
-- 034_migrate_case_billing_to_invoices.sql
-- 案件詳細「契約・報酬・請求」タブで管理していた請求・入金情報を
-- 正式な invoices / payments テーブルへ移行する。
--
-- 対象カラム（cases テーブル）:
--   - invoice_status
--   - invoice_date
--   - payment_due_date
--   - payment_confirmed_date
--   - payment_amount
--   - invoice_memo
--   - payment_status (旧, 005で追加)
--
-- 残置するカラム（契約条件として案件単位で持つ意味がある）:
--   - fee_administrative, fee_judicial, fee_total（報酬金額）
--   - advance_payment（前受金）
--   - partner_compensation（パートナー報酬）
--   - total_revenue_estimate
--
-- 本 migration ではデータ移行のみ実施。カラム自体の DROP は
-- アプリ側の参照が完全に消えたことを確認した後、別 migration で実施。
-- ============================================================

-- データ移行は冪等的に行う:
--   - 案件1件につき invoices は1件のみ作成（既に invoices が紐づいていれば作成しない）
--   - 案件1件につき payments は1件のみ作成（payment_amount に基づく）

WITH new_invoices AS (
  INSERT INTO invoices (
    case_id,
    invoice_type,
    amount,
    status,
    issued_date,
    due_date,
    notes,
    created_at,
    updated_at
  )
  SELECT
    c.id,
    '確定請求'::TEXT AS invoice_type,
    COALESCE(c.fee_total, 0)::BIGINT AS amount,
    -- invoice_status をマッピング（不正値は '未請求' にフォールバック）
    CASE
      WHEN c.invoice_status IN ('未請求', '前受金請求済', '前受金入金済', '確定請求済', '入金済', '一部入金')
        THEN c.invoice_status
      WHEN c.payment_status IN ('未請求', '前受金請求済', '前受金入金済', '確定請求済', '入金済', '一部入金')
        THEN c.payment_status
      WHEN c.payment_amount IS NOT NULL AND c.payment_amount > 0
        THEN '入金済'
      WHEN c.invoice_date IS NOT NULL
        THEN '確定請求済'
      ELSE '未請求'
    END AS status,
    c.invoice_date,
    c.payment_due_date,
    c.invoice_memo,
    COALESCE(c.invoice_date::TIMESTAMPTZ, now()),
    now()
  FROM cases c
  WHERE
    (
      c.invoice_status IS NOT NULL
      OR c.invoice_date IS NOT NULL
      OR c.payment_due_date IS NOT NULL
      OR c.payment_confirmed_date IS NOT NULL
      OR c.payment_amount IS NOT NULL
      OR c.invoice_memo IS NOT NULL
      OR c.payment_status IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM invoices i WHERE i.case_id = c.id
    )
  RETURNING id, case_id
)
INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes)
SELECT
  ni.id,
  c.payment_amount::BIGINT,
  COALESCE(c.payment_confirmed_date, c.invoice_date, CURRENT_DATE),
  NULL,
  '案件詳細から移行 (migration 034)'
FROM new_invoices ni
JOIN cases c ON c.id = ni.case_id
WHERE c.payment_amount IS NOT NULL
  AND c.payment_amount > 0;

-- 確認用ログ: 移行件数を NOTICE で出す（migration ログに残る）
DO $$
DECLARE
  v_invoice_count INT;
  v_payment_count INT;
BEGIN
  SELECT COUNT(*) INTO v_invoice_count
  FROM invoices
  WHERE notes IS NOT NULL OR true;  -- 全件カウントだと意味薄いので "case_id があるもの" = 全件

  SELECT COUNT(*) INTO v_payment_count
  FROM payments
  WHERE notes = '案件詳細から移行 (migration 034)';

  RAISE NOTICE 'migration 034: invoices total = %, migrated payments = %', v_invoice_count, v_payment_count;
END $$;
