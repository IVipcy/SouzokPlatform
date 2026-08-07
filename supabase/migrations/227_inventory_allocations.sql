-- ============================================================
-- 227_inventory_allocations.sql
-- 財産目録を、実物のエクセル「財産・債務一覧表」と同じ形にする。
--
-- エクセルは 財産の各行に「取得者」の列が相続人ごとに並び、そこへ金額を割り振る。
-- 一番下に 取得合計 と 法定相続分（参考）が出て、法定どおりとのズレが見える。
-- 目録と分割案が1枚になっているのが実務の使い方なので、それに合わせる。
--
--   asset_inventory.allocations … { 相続人id: 金額 } の割付。
--     行ごとに配分が違う（不動産はAが全部・預金は3人で等分 等）のが普通なので、
--     案件レベルの比率ではなく行ごとに持つ。空なら未割付。
--   heirs.legal_share_num / den … 法定相続割合。エクセルの手入力の定数にあたる。
--     分数で持つ（1/3 を小数にすると3人分を足しても1にならず、目録の合計が合わなくなる）。
--     自動計算した値を初期値として入れ、代襲・放棄などがあれば画面で上書きする。
-- ============================================================

ALTER TABLE asset_inventory ADD COLUMN IF NOT EXISTS allocations jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN asset_inventory.allocations IS '取得者ごとの割付 { heir_id: 金額 }。空なら未割付。';

ALTER TABLE heirs ADD COLUMN IF NOT EXISTS legal_share_num integer;
ALTER TABLE heirs ADD COLUMN IF NOT EXISTS legal_share_den integer;
COMMENT ON COLUMN heirs.legal_share_num IS '法定相続割合（分子）。目録の「参考：法定相続分」に使う。';
COMMENT ON COLUMN heirs.legal_share_den IS '法定相続割合（分母）。';
