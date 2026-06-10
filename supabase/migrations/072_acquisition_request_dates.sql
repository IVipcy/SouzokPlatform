-- ============================================================
-- 072_acquisition_request_dates.sql
-- 不動産 取得物（登記情報/公図/地積測量図/路線価/評価証明）ごとの
-- 「いつ請求したか・いつ受領したか」を管理（追加のみ・非破壊）
-- ============================================================

ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS registry_request_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS registry_receipt_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS cadastral_request_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS cadastral_receipt_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS survey_map_request_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS survey_map_receipt_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS route_price_request_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS route_price_receipt_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS eval_cert_request_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS eval_cert_receipt_date DATE;
