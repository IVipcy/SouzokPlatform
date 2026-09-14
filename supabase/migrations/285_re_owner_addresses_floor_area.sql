-- 285: 不動産（2026-09-15）
--   ・real_estate_acquisitions.owner_addresses … 固定資産証明等申請書の「所有者・納税義務者」の住所（1行1住所。住所歴を複数出せる）。
--       請求カード Step1 で入れる。空なら被相続人情報の住所を使う。
--   ・real_estate_properties.floor_area … 建物の床面積（㎡）。これまで「構造・床面積」が1つの欄（building_structure）だったのを分ける。
--       既存の「木造2階建 95.20㎡」は、数字＋㎡を床面積へ移し、構造からは外す。

ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS owner_addresses text;
COMMENT ON COLUMN real_estate_acquisitions.owner_addresses IS '申請書の所有者・納税義務者の住所（1行1住所）。空なら被相続人の住所';

ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS floor_area text;
COMMENT ON COLUMN real_estate_properties.floor_area IS '建物の床面積（㎡）。migration 285 で構造から分けた';

UPDATE real_estate_properties
   SET floor_area = (regexp_match(building_structure, '([0-9]+(?:\.[0-9]+)?)\s*(?:㎡|m2|平米)'))[1],
       building_structure = NULLIF(trim(regexp_replace(building_structure, '\s*[0-9]+(?:\.[0-9]+)?\s*(?:㎡|m2|平米)', '', 'g')), '')
 WHERE building_structure ~ '[0-9]+(?:\.[0-9]+)?\s*(?:㎡|m2|平米)' AND floor_area IS NULL;

NOTIFY pgrst, 'reload schema';

-- 確認：
-- SELECT building_structure, floor_area FROM real_estate_properties WHERE floor_area IS NOT NULL LIMIT 10;
