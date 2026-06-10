-- ============================================================
-- 067_financial_survey_prohibition.sql
-- 財産調査：禁止期間・禁止理由（追加のみ・非破壊）
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS financial_survey_prohibited_period TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS financial_survey_prohibited_reason TEXT;

COMMENT ON COLUMN cases.financial_survey_prohibited_period IS '財産調査禁止期間';
COMMENT ON COLUMN cases.financial_survey_prohibited_reason IS '財産調査禁止理由';
