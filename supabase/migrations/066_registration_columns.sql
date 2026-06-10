-- ============================================================
-- 066_registration_columns.sql
-- 相続登記セクション：名義変更要否＋可変列（任意項目）対応（追加のみ・非破壊）
--
--   cases.registration_columns         : 登記表の任意項目（列名）の定義（案件単位で共有）
--   real_estate_properties.title_change_required : 名義変更要否（要/不要/確認中）
--   real_estate_properties.registration_data     : 任意項目の値（{列名: 値} のJSON）
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS registration_columns JSONB DEFAULT '[]'::jsonb;

ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS title_change_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS registration_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cases.registration_columns IS '相続登記表の任意項目（列名）の定義。例：["申請日","完了日","法務局"]';
COMMENT ON COLUMN real_estate_properties.title_change_required IS '名義変更要否（要/不要/確認中）';
COMMENT ON COLUMN real_estate_properties.registration_data IS '相続登記の任意項目の値（{列名:値}）';
