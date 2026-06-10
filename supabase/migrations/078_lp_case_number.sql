-- ============================================================
-- 078_lp_case_number.sql
-- LP案件管理番号（相続ステーション側の元案件番号）を保持する列を追加。
--   相続PFのメイン案件番号(case_number)は新採番ルールで付与する一方、
--   連携元（相続ステーション）の番号は lp_case_number に保持し、
--   LP案件一覧での検索・突合に使う。
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS lp_case_number TEXT;

CREATE INDEX IF NOT EXISTS idx_cases_lp_case_number ON cases(lp_case_number);
