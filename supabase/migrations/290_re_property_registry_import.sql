-- 290: 登記情報（txt）の取り込み（2026-09-22）
-- リーガル等で取得した「最新の記載事項」txt を読んで物件（real_estate_properties）を作る／更新する。
--   ・property_number     … 不動産番号（13桁）。同じ物件の突き合わせと、登記申請に使う
--   ・registry_imported_at … 登記情報から取り込んだ日時（行に「登記情報 取込」の印を出す）
--   ・co_owners           … 被相続人以外の共有者（住所 氏名 持分 を改行区切り）。持分の列は被相続人のぶんだけ
ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS property_number text,
  ADD COLUMN IF NOT EXISTS registry_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS co_owners text;
COMMENT ON COLUMN real_estate_properties.property_number IS '不動産番号（登記情報から。migration 290）';
COMMENT ON COLUMN real_estate_properties.registry_imported_at IS '登記情報（txt）から取り込んだ日時（migration 290）';
COMMENT ON COLUMN real_estate_properties.co_owners IS '被相続人以外の共有者（登記情報から。migration 290）';

NOTIFY pgrst, 'reload schema';
