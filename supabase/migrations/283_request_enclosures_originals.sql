-- 283: 請求の「通数・同梱する資料」と、原本の出入り（2026-09-13）
--
-- ・koseki_requests.copy_count … 請求する通数。請求書の「通数」欄に写す（これまで請求書を作る画面で別に入れていた）
-- ・request_enclosures … 請求に同梱する資料（本人確認書類の写し・委任状・印鑑登録証明書・返信用封筒 など）。
--     1行1資料。ref_kind/ref_id でどの請求か（koseki=koseki_requests / re=real_estate_acquisitions / fin=financial_requests / cancel=financial_assets）。
--     form='原本' で stock_key が付いたものは「原本を出した」＝手元の数が減る。戻ってきたら受信簿で「原本の返却」として受け、returned_qty が増える。
-- ・original_doc_overrides … 原本の出入りの表の手直し。原本の行は契約時受領書類(contract:{id})・受信簿の到着物(receipt:{item_id})から自動で作るので、
--     ここには「棚卸しで直した受領通数」「お客様へ返した／納品した数」「手で足した原本(manual:{id})」だけを持つ。
-- ・document_receipt_items.return_enclosure_id / return_fin_request_id … この到着物は「原本の返却」。どの同梱（または金融の請求の印鑑証明）が戻ったか。
--
-- 金融の印鑑登録証明書（financial_requests.seal_original_sent / seal_original_returned_date。migration 272）はそのまま使い、
-- 原本の出入りの表では同じ「出払い中」として合算して見せる。

ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS copy_count integer;
COMMENT ON COLUMN koseki_requests.copy_count IS '請求する通数（請求書の通数欄）';

CREATE TABLE IF NOT EXISTS request_enclosures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  ref_kind text NOT NULL CHECK (ref_kind IN ('koseki', 're', 'fin', 'cancel')),
  ref_id text NOT NULL,
  ref_label text,                                   -- 請求の呼び名（例：横浜市都筑区 戸籍請求（山田太郎））。原本の出入りの「出先」に出す
  doc_name text NOT NULL,                           -- 資料名（例：印鑑登録証明書（山田花子））
  quantity integer NOT NULL DEFAULT 1,
  form text NOT NULL DEFAULT '原本' CHECK (form IN ('原本', '写し', 'その他')),
  stock_key text,                                   -- 原本の出入りの行のキー（contract:{id} / receipt:{item_id} / manual:{id}）。原本のときだけ
  returned_qty integer NOT NULL DEFAULT 0,          -- 戻ってきた数（受信簿の「原本の返却」で増える）
  returned_on date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_enclosures_case ON request_enclosures(case_id);
CREATE INDEX IF NOT EXISTS idx_request_enclosures_ref ON request_enclosures(ref_kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_request_enclosures_stock ON request_enclosures(stock_key);
ALTER TABLE request_enclosures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS request_enclosures_all ON request_enclosures;
CREATE POLICY request_enclosures_all ON request_enclosures FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE request_enclosures IS '請求に同梱する資料（1行1資料）。原本を選ぶと手元の数が減り、受信簿の返却で戻る';

CREATE TABLE IF NOT EXISTS original_doc_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stock_key text NOT NULL,
  doc_name text,                                    -- 手で足した原本（manual:）の名前
  person text,                                      -- 誰のものか（任意）
  received_qty integer,                             -- 棚卸しで直した受領通数（null＝元の数のまま）
  delivered_qty integer NOT NULL DEFAULT 0,         -- お客様へ返した／納品した数（手元から外す）
  delivered_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, stock_key)
);
CREATE INDEX IF NOT EXISTS idx_original_doc_overrides_case ON original_doc_overrides(case_id);
ALTER TABLE original_doc_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS original_doc_overrides_all ON original_doc_overrides;
CREATE POLICY original_doc_overrides_all ON original_doc_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE original_doc_overrides IS '原本の出入りの手直し（棚卸し・納品・手で足した原本）。行そのものは契約時受領書類と受信簿から自動';

ALTER TABLE document_receipt_items ADD COLUMN IF NOT EXISTS return_enclosure_id uuid REFERENCES request_enclosures(id) ON DELETE SET NULL;
ALTER TABLE document_receipt_items ADD COLUMN IF NOT EXISTS return_fin_request_id uuid REFERENCES financial_requests(id) ON DELETE SET NULL;
COMMENT ON COLUMN document_receipt_items.return_enclosure_id IS 'この到着物は原本の返却：戻ってきた同梱（request_enclosures）';
COMMENT ON COLUMN document_receipt_items.return_fin_request_id IS 'この到着物は原本の返却：金融の請求に出していた印鑑登録証明書';

NOTIFY pgrst, 'reload schema';

-- 確認：
-- SELECT column_name FROM information_schema.columns WHERE table_name='koseki_requests' AND column_name='copy_count';
-- SELECT count(*) FROM request_enclosures; SELECT count(*) FROM original_doc_overrides;
