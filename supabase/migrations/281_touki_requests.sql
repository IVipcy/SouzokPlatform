-- 登記依頼（管理担当 → 相続登記チーム）。2026-09-11
--
-- 申請書・委任状は別システム（相続の力）で作るので、ここで持つのは「依頼のやりとり」と「結果」だけ。
-- 報連相（case_reports）とは分ける（種別・法務局・対象物件・登記部門の担当・結果を持ち、宛先は常に登記チーム）。
--   種別：作成願い／チェック願い／申請願い／申請セットチェック願い／謄本・製本願い
--   状態：依頼中 → 対応中（登記部門の誰かが「対応する」）→ 完了 ／ 修正あり（コメント必須）
--   修正ありのときは管理担当が直して同じ種別で再依頼（parent_id で元の依頼に紐づく）
CREATE TABLE IF NOT EXISTS touki_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('作成願い', 'チェック願い', '申請願い', '申請セットチェック願い', '謄本・製本願い')),
  office text,                         -- 法務局
  registration_type text,              -- 登記の種類（相続 など）
  property_ids uuid[],                 -- 対象物件（real_estate_properties.id）
  note text,                           -- 一言
  requester_id uuid REFERENCES members(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT '依頼中' CHECK (status IN ('依頼中', '対応中', '完了', '修正あり')),
  assignee_id uuid REFERENCES members(id),   -- 登記部門の担当（「対応する」を押した人）
  started_at timestamptz,
  result_comment text,                 -- 結果のコメント（修正ありは必須）
  responded_by uuid REFERENCES members(id),
  responded_at timestamptz,
  parent_id uuid REFERENCES touki_requests(id),  -- 再依頼の元
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_touki_requests_case ON touki_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_touki_requests_status ON touki_requests(status);
CREATE INDEX IF NOT EXISTS idx_touki_requests_requester ON touki_requests(requester_id);

ALTER TABLE touki_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS touki_requests_all ON touki_requests;
CREATE POLICY touki_requests_all ON touki_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE touki_requests IS '登記依頼（管理担当→相続登記チーム）。申請書は別システムで作るため、依頼のやりとりと結果だけを持つ';

-- 物件ごとの登記に、受付番号と納品日を足す（申請は別システムで行い、結果をここに写す）
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS registration_receipt_no text;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS registration_delivery_date date;
COMMENT ON COLUMN real_estate_properties.registration_receipt_no IS '相続登記 受付番号';
COMMENT ON COLUMN real_estate_properties.registration_delivery_date IS '相続登記 権利証の納品日';

-- 確認：
-- SELECT request_type, status, count(*) FROM touki_requests GROUP BY 1, 2;
