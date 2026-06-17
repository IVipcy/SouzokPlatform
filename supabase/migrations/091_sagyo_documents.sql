-- ============================================================
-- 091_sagyo_documents.sql
-- 作業（intake_roles の各行）に紐づく「必要書類・請求・受領」を行＝1書類で持つ連結テーブル。
-- 受領は既存の受信簿(document_receipts)と receipt_id でFK連動（届いたら作業側にも反映できる）。
--
-- 作業の識別は自然キー (case_id, gyomu, sagyou)。
--   ※ intake_roles(JSONB) 側に安定IDを持たせず、業務名＋作業名で紐づける。
--     作業名のリネームでリンクが切れるのは許容（実務上まれ）。将来 case_sagyo を
--     テーブル化する場合は sagyo_id(uuid) へ移行する。
-- マイグレは追加のみ。ユーザーが手動適用。
-- ============================================================

CREATE TABLE IF NOT EXISTS sagyo_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  gyomu TEXT NOT NULL,                 -- 業務（例: 金融資産 / 放棄手続き）
  sagyou TEXT NOT NULL,                -- 作業（例: 残高証明取得）。intake_roles[].sagyou と一致
  name TEXT,                           -- 書類名（例: ○○銀行 残高証明書）
  requested_to TEXT,                   -- 請求先（例: ○○銀行 △△支店）
  requested_date DATE,                 -- 請求日
  received_date DATE,                  -- 受領日（受信簿と連動すると入る／手入力も可）
  receipt_id UUID REFERENCES document_receipts(id) ON DELETE SET NULL,  -- 受信簿連動
  status TEXT,                         -- 未請求 / 請求済 / 受領 / 不要 等
  note TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sagyo_documents_case ON sagyo_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_sagyo_documents_sagyo ON sagyo_documents(case_id, gyomu, sagyou);
CREATE INDEX IF NOT EXISTS idx_sagyo_documents_receipt ON sagyo_documents(receipt_id);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_sagyo_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sagyo_documents_updated_at ON sagyo_documents;
CREATE TRIGGER trg_sagyo_documents_updated_at
  BEFORE UPDATE ON sagyo_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_sagyo_documents_updated_at();

ALTER TABLE sagyo_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sagyo_documents_select_authenticated" ON sagyo_documents;
CREATE POLICY "sagyo_documents_select_authenticated" ON sagyo_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sagyo_documents_modify_authenticated" ON sagyo_documents;
CREATE POLICY "sagyo_documents_modify_authenticated" ON sagyo_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
