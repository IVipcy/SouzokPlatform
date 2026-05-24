-- ============================================================
-- 041_document_receipts.sql
-- 書類受信簿（届いた書類の受領記録）用のテーブル。
--   - document_receipts: 1受領イベント=1行（案件＋受領日＋連番＋ダブルチェック＋着手者）
--   - document_receipt_items: 受領レコードに紐づく個別項目（戸籍/住民票など、複数可）
--
-- 番号採番ルール:
--   表示は MMDD/連番 形式（例: 5月13日の1件目 = "0513/001"）
--   sequence_no は received_date 単位で 1 から始まる連番。
--   日が変わると 001 から自動的に振り直される（received_date が違うので別グループ）。
-- ============================================================

-- ---------------------------
-- 1. document_receipts
-- ---------------------------
CREATE TABLE IF NOT EXISTS document_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  received_date DATE NOT NULL,
  sequence_no INT NOT NULL,
  -- ダブルチェック（書類確認ダブルチェック列の✓）
  dual_check_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  dual_checked_at TIMESTAMPTZ,
  -- 着手（着手ボタンを押した人）
  started_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (received_date, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_document_receipts_case ON document_receipts(case_id);
CREATE INDEX IF NOT EXISTS idx_document_receipts_date ON document_receipts(received_date DESC, sequence_no DESC);

-- BEFORE INSERT で sequence_no を自動採番（received_date 内で 1, 2, 3, …）
CREATE OR REPLACE FUNCTION assign_document_receipt_sequence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sequence_no IS NULL OR NEW.sequence_no = 0 THEN
    SELECT COALESCE(MAX(sequence_no), 0) + 1
      INTO NEW.sequence_no
      FROM document_receipts
      WHERE received_date = NEW.received_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_document_receipt_sequence ON document_receipts;
CREATE TRIGGER trg_assign_document_receipt_sequence
  BEFORE INSERT ON document_receipts
  FOR EACH ROW
  EXECUTE FUNCTION assign_document_receipt_sequence();

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_document_receipts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_receipts_updated_at ON document_receipts;
CREATE TRIGGER trg_document_receipts_updated_at
  BEFORE UPDATE ON document_receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_document_receipts_updated_at();

ALTER TABLE document_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_receipts_select_authenticated" ON document_receipts;
CREATE POLICY "document_receipts_select_authenticated" ON document_receipts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "document_receipts_modify_authenticated" ON document_receipts;
CREATE POLICY "document_receipts_modify_authenticated" ON document_receipts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------
-- 2. document_receipt_items
-- ---------------------------
CREATE TABLE IF NOT EXISTS document_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES document_receipts(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,        -- 例: 戸籍 / 住民票 / 名古屋戸籍
  quantity INT,                   -- 通数
  received_from TEXT,             -- 受領先（例: 名古屋市区役所）
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_receipt_items_receipt ON document_receipt_items(receipt_id, sort_order);

ALTER TABLE document_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_receipt_items_select_authenticated" ON document_receipt_items;
CREATE POLICY "document_receipt_items_select_authenticated" ON document_receipt_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "document_receipt_items_modify_authenticated" ON document_receipt_items;
CREATE POLICY "document_receipt_items_modify_authenticated" ON document_receipt_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
