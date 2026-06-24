-- 受注区分パート制 Phase3 横展開：不動産・金融資産にも取得パートを記録する。
-- 後見/執行/調停/遺言/信託 → 手続き一式 のような複数パート案件では、財産調査(不動産・金融資産)も
-- 先行パートと本体パートの両方で発生し得るため、どのパートで取得したかをバッジで区別する。
-- 戸籍(128)と同型。単独パートでは未使用。
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS acquired_part text;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS acquired_part text;

COMMENT ON COLUMN real_estate_properties.acquired_part IS '取得した受注区分パート（service_parts のキー。行作成時の現在パートを自動記録）。';
COMMENT ON COLUMN financial_assets.acquired_part IS '取得した受注区分パート（service_parts のキー。行作成時の現在パートを自動記録）。';
