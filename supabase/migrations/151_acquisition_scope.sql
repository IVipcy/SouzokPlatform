-- ============================================================
-- 151_acquisition_scope.sql
-- 不動産の取得資料を「①市区町村へ請求(名寄帳/評価証明)」と
-- 「②物件ごとに取得(登記情報/公図/地積測量図/路線価)」に明確に分離するための区分列。
-- これが無いと新規行(取得物未選択)が①②の両表に出てしまう。
-- ============================================================
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS scope text;

-- 既存行は取得物(item_type)の対象種別から推定して埋める
UPDATE real_estate_acquisitions SET scope = 'property'
  WHERE scope IS NULL AND item_type IN ('登記情報','所有者事項','公図','地積測量図','路線価');
UPDATE real_estate_acquisitions SET scope = 'municipality'
  WHERE scope IS NULL AND item_type IN ('評価証明','名寄帳');
