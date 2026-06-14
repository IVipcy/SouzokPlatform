-- ============================================================
-- 086_contract_documents.sql
-- 契約手続きの「①受領書類」を行単位の表にする（受信簿と連動するため）。
--   従来は cases.intake_documents(JSONB) で持っていたが、行にIDが無く受信簿から
--   受領日を書き戻せなかった。専用テーブル化して linked_kind='contract_doc' で連動する。
--   既存の intake_documents は本マイグレでバックフィル後、参照をやめる（列は非破壊で残置）。
-- ============================================================

CREATE TABLE IF NOT EXISTS contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT,                          -- 書類名（契約書/委任状 など）
  status TEXT,                        -- 受領状況: その場で受領/後日郵送/依頼者が取得/不要
  expected_arrival_date DATE,         -- 到着予定日（見込み）
  arrival_date DATE,                  -- 到着日（受領日。受信簿で受信すると入る＝受信済）
  case_document_id UUID,              -- 受領した書類（case_documents）への紐づけ
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_documents_case ON contract_documents(case_id);

ALTER TABLE contract_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_documents_all ON contract_documents;
CREATE POLICY contract_documents_all ON contract_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER contract_documents_updated_at
  BEFORE UPDATE ON contract_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 既存 cases.intake_documents(JSONB) を contract_documents へバックフィル。
--   旧 arrival_date（=到着予定日）は expected_arrival_date に移す。重複防止のため未投入の案件のみ。
INSERT INTO contract_documents (case_id, name, status, expected_arrival_date, notes, sort_order)
SELECT c.id,
       elem->>'name'   AS name,
       elem->>'status' AS status,
       NULLIF(elem->>'arrival_date','')::date AS expected_arrival_date,
       elem->>'note'   AS notes,
       (ord - 1)::int  AS sort_order
FROM cases c
CROSS JOIN LATERAL jsonb_array_elements(c.intake_documents) WITH ORDINALITY AS arr(elem, ord)
WHERE c.intake_documents IS NOT NULL
  AND jsonb_typeof(c.intake_documents) = 'array'
  AND NOT EXISTS (SELECT 1 FROM contract_documents cd WHERE cd.case_id = c.id);
