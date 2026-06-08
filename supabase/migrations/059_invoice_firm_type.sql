-- ============================================================
-- 059_invoice_firm_type.sql
-- 請求書（領収書）の発行法人区分（行政書士/司法書士）
--
-- オーシャングループは行政書士法人・司法書士法人を持ち、請求書・領収書の
-- フォーマット（発行元・インボイス登録番号・振込先）が法人ごとに異なる。
-- 連名案件では行用・司用の請求書を別々に発行するため、請求書1枚ごとに
-- どちらの法人が発行したかを保持する。
--   gyosei = 行政書士法人オーシャン / shiho = 司法書士法人オーシャン
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS firm_type TEXT CHECK (firm_type IN ('gyosei', 'shiho'));

-- 既存データを契約形態から補完（単独は確定。連名・未設定は手動指定のため NULL のまま）
UPDATE invoices i
   SET firm_type = CASE c.contract_type
     WHEN '行政書士法人単独' THEN 'gyosei'
     WHEN '司法書士法人単独' THEN 'shiho'
     ELSE NULL
   END
  FROM cases c
 WHERE i.case_id = c.id
   AND i.firm_type IS NULL
   AND c.contract_type IN ('行政書士法人単独', '司法書士法人単独');

CREATE INDEX IF NOT EXISTS idx_invoices_firm_type ON invoices(firm_type);
