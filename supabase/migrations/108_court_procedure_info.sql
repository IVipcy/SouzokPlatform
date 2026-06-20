-- 家庭裁判所手続き（放棄/調停/検認/後見）の共通情報を保持。
-- 1案件で複数の家裁手続きを持ちうるので、業務(gyomu)をキーにしたJSONBで持つ。
--   court_procedure_info = {
--     "放棄手続き": { court, case_number, filed_date, hearing_date, result },
--     "検認手続き": { ... }, ...
--   }
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS court_procedure_info JSONB;

COMMENT ON COLUMN cases.court_procedure_info IS '家裁手続きの共通情報（業務別。管轄家裁/事件番号/申立日/期日/結果）';
