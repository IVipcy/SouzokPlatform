-- 292: 資産概算（調査開始前）（2026-09-23）
-- 面談時点では口座ごとの残高や物件ごとの評価額は分からない。面談シート・オーダーシートの
-- 「残高」「評価額」の欄と合計バンドをやめ、代わりに内訳（区分・金額・メモ）を足して合計を見る区画を置く。
-- 合計は cases.total_asset_estimate に写す（案件一覧の「資産」列と同じ値になる）。
-- 実務タブの評価額確定（real_estate_properties.appraisal_value）と残高（financial_assets.balance_amount）はそのまま。
CREATE TABLE IF NOT EXISTS case_asset_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind text NOT NULL,            -- 不動産／預貯金／証券・信託／生命保険／その他財産／相続債務／その他費用
  amount numeric,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_asset_estimates_case_idx ON case_asset_estimates(case_id);
ALTER TABLE case_asset_estimates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_asset_estimates_all ON case_asset_estimates;
CREATE POLICY case_asset_estimates_all ON case_asset_estimates FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE case_asset_estimates IS '資産概算（調査開始前）の内訳。合計は cases.total_asset_estimate。migration 292';

NOTIFY pgrst, 'reload schema';
