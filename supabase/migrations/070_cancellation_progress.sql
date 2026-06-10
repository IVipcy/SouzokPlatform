-- ============================================================
-- 070_cancellation_progress.sql
-- 解約手続：請求日・到着日・完了フラグ（追加のみ・非破壊）
--   cancellation_required      解約有無（有/無/確認中）※既存を流用
--   cancellation_date          解約予定日 ※既存を流用
--   cancellation_request_date  解約書類の請求日
--   cancellation_arrival_date  解約書類の到着日
--   cancellation_done          解約完了
-- ============================================================

ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS cancellation_request_date DATE;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS cancellation_arrival_date DATE;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS cancellation_done BOOLEAN NOT NULL DEFAULT false;
