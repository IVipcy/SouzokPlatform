-- ============================================================
-- 226_inventory_source_fields.sql
-- 財産目録（財産・債務一覧表）に必要な項目を、調査の入り口＝財産調査タブで拾えるようにする。
--
-- 方針：
--   目録・遺産分割協議書・登録免許税計算は、すべて財産調査で集めた情報の再利用。
--   目録を作る段になって登記簿を見直す（＝二度手間）を避けるため、調査時点で入れる。
--
--   ・不動産：地目／地積／持分／種類／構造・床面積／抵当権
--     使用状況は既存の resident_status（OCCUPANCY_STATUSES）を流用するので追加しない。
--   ・持分は「分子／分母」の2列で持つ。実物のエクセルに 4567/1234567 のような分数があり、
--     小数に丸めると 固定資産価格×持分 が数円ずれるため。表示も分数のまま行う。
--   ・有価証券：1つの証券会社に複数銘柄がぶら下がるので、明細は別テーブルにする。
--     目録の「合計評価額」＝明細の合計、「備考」＝株数×1株評価額（基準日）に相当。
-- ============================================================

-- 不動産（土地）
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS land_category text;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS land_area numeric;
-- 不動産（建物）
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS building_kind text;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS building_structure text;
-- 共通
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS share_numerator numeric;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS share_denominator numeric;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS mortgage text;

COMMENT ON COLUMN real_estate_properties.land_category       IS '地目（宅地・田・畑 等）。土地のみ。';
COMMENT ON COLUMN real_estate_properties.land_area           IS '地積（㎡）。土地のみ。';
COMMENT ON COLUMN real_estate_properties.building_kind       IS '種類（居宅・共同住宅 等）。建物のみ。';
COMMENT ON COLUMN real_estate_properties.building_structure  IS '構造・床面積。建物のみ。';
COMMENT ON COLUMN real_estate_properties.share_numerator     IS '被相続人の登記持分（分子）。未入力なら持分1として扱う。';
COMMENT ON COLUMN real_estate_properties.share_denominator   IS '被相続人の登記持分（分母）。';
COMMENT ON COLUMN real_estate_properties.mortgage            IS '抵当権（設定内容。例：◯◯銀行 抵当権設定）。';

-- 有価証券の銘柄明細
CREATE TABLE IF NOT EXISTS securities_holdings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  financial_asset_id uuid NOT NULL REFERENCES financial_assets(id) ON DELETE CASCADE,
  brand_name         text,      -- 銘柄名
  quantity           numeric,   -- 株数・口数
  unit_price         numeric,   -- 1株（1口）あたり評価額
  base_date          date,      -- 評価の基準日（「※何月何日時点」）
  -- 評価額。既定は 株数×単価 だが、端数や投資信託の基準価額など計算が合わない商品もあるため
  -- 手入力での上書きを許す（NULL のとき 株数×単価 を使う）。
  amount             numeric,
  note               text,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_securities_holdings_asset ON securities_holdings(financial_asset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_securities_holdings_case ON securities_holdings(case_id);

ALTER TABLE securities_holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS securities_holdings_all ON securities_holdings;
CREATE POLICY securities_holdings_all ON securities_holdings FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE securities_holdings IS '有価証券の銘柄明細。財産目録の「合計評価額」はこの合計、「備考」は株数×1株評価額（基準日）にあたる。';
