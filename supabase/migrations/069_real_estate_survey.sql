-- ============================================================
-- 069_real_estate_survey.sql
-- 不動産：名寄せ・参照元・取得物（要否＋取得済）管理（追加のみ・非破壊）
--
--   名寄せ:
--     name_consolidation_arrival_date  名寄せ到着日（請求先は既存 name_consolidation_dest）
--     admin_sq_required / judicial_sq_required  行政SQ / 司法SQ の要否（要/不要/確認中）
--   参照元（チェック）:
--     ref_nayose / ref_title_deed / ref_tax_notice  名寄せ参照 / 権利書参照 / 納税通知書参照
--   取得物の要否（要/不要/確認中）。取得済は既存 has_* / 新 eval_cert_obtained を使用:
--     registry_required(登記情報) / cadastral_required(公図) / survey_map_required(地積測量図)
--     route_price_required(路線価) / eval_cert_required(評価証明)
--     eval_cert_obtained  評価証明 取得済
--   ※ マンション敷地注意は既存 is_condo_land を流用。
-- ============================================================

ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS name_consolidation_arrival_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS admin_sq_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS judicial_sq_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS ref_nayose BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS ref_title_deed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS ref_tax_notice BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS registry_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS cadastral_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS survey_map_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS route_price_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS eval_cert_required TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS eval_cert_obtained BOOLEAN NOT NULL DEFAULT false;
