-- 不動産の「取得資料管理」（戸籍請求一覧と同じ思想のフラット表）。
-- どの取得物を・どこに・いつ請求し、受け取れたか（参照=路線価も含む）を案件単位で管理する。
-- 取得方法（請求/参照）は item_type から導出。物件単位(登記情報/公図/地積/路線価)は target_property_id、
-- 市区町村単位(評価証明/名寄帳)は target_municipality を使う。

CREATE TABLE IF NOT EXISTS real_estate_acquisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  item_type TEXT,                 -- 登記情報/公図/地積測量図/評価証明/名寄帳/路線価
  target_property_id UUID REFERENCES real_estate_properties(id) ON DELETE SET NULL,  -- 物件単位の対象
  target_municipality TEXT,       -- 市区町村単位の対象
  request_to TEXT,                -- 請求先（法務局/市区町村役所 等）
  request_date DATE,
  expected_arrival_date DATE,
  arrival_date DATE,
  received BOOLEAN NOT NULL DEFAULT FALSE,  -- 取得済
  amount NUMERIC,                 -- 路線価の金額等（任意）
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_real_estate_acquisitions_case ON real_estate_acquisitions(case_id);

COMMENT ON TABLE real_estate_acquisitions IS '不動産の取得資料管理（請求・参照を問わず、何をどこにいつ取得し受領したか）';
