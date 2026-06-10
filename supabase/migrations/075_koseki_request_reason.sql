-- ============================================================
-- 075_koseki_request_reason.sql
-- 戸籍請求の「請求理由」を請求単位（行ごと）に持たせる（追加のみ・非破壊）
--   request_reason        戸籍請求理由
--   request_reason_other  戸籍請求理由（その他）
--   ※ 種別=doc_types / 取得目的=purpose / 特記=notes は既存カラムを流用
-- ============================================================

ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS request_reason TEXT;
ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS request_reason_other TEXT;
