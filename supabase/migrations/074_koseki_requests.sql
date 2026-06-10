-- ============================================================
-- 074_koseki_requests.sql
-- 戸籍請求を「請求単位」で管理する表（新規テーブル・追加のみ）
--   どこに(request_to)・誰の(target_person)・何を(doc_types)・何のために(purpose)
--   いつ請求したか(request_date)・いつ届いたか(arrival_date) を行単位で管理する。
--   既存の cases.koseki_* カラムは「全体設定」として併存（破壊しない）。
-- ============================================================

CREATE TABLE IF NOT EXISTS koseki_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  request_to TEXT,                          -- 請求先（市区町村/本籍地役所 など）
  target_person TEXT,                       -- 対象者（誰の戸籍か）
  doc_types TEXT,                           -- 種別（戸籍/除籍/原戸籍/附票 など）
  purpose TEXT,                             -- 取得目的（相続登記/遺産分割 など）
  request_date DATE,                        -- 請求日
  arrival_date DATE,                        -- 到着日（受領日）
  notes TEXT,                               -- 備考
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_koseki_requests_case ON koseki_requests(case_id);

ALTER TABLE koseki_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS koseki_requests_all ON koseki_requests;
CREATE POLICY koseki_requests_all ON koseki_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER koseki_requests_updated_at
  BEFORE UPDATE ON koseki_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
