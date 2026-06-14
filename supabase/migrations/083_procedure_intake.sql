-- ============================================================
-- 083_procedure_intake.sql
-- 面談時の「手続き詳細」: 受領書類の状況と、各手続きの役割分担（自社/依頼者）。
-- 受託（契約処理の残）→対応中（請求・自社作業）の整理の起点になる構造化データ。
--   intake_documents JSONB: [{ name, status, arrival_date, note }]
--     status = その場で受領 / 後日郵送 / 依頼者が取得 / 不要
--   intake_roles JSONB:     [{ item, owner, note }]
--     owner = 自社 / 依頼者 / 不要
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake_documents JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake_roles JSONB;
