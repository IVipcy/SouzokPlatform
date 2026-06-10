-- ============================================================
-- 071_title_change_progress.sql
-- 相続登記（名義変更）の進捗管理（追加のみ・非破壊）
--   title_change_required      名義変更要否（要/不要/確認中）※既存を流用
--   title_change_date          名義変更実施日
--   title_change_request_date  必要情報の請求日
--   title_change_arrival_date  必要情報の到着日
--   title_change_done          名義変更完了
-- ============================================================

ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS title_change_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS title_change_request_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS title_change_arrival_date DATE;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS title_change_done BOOLEAN NOT NULL DEFAULT false;
