-- ============================================================
-- 234_request_kind_expense.sql
-- 戸籍・不動産資料の「請求区分」。誤請求ぶんの費用をお客様に請求せず、自社の経費として扱うため。
--
--   koseki_requests.request_kind          … 通常請求 / 誤請求 / 追加請求 / 再請求
--   real_estate_acquisitions.request_kind … 通常請求 / 誤請求
--
-- 誤請求の行は立替実費に入れず、経費（案件別に集計）として数える。
-- 既存データはすべて「通常請求」として扱う（NULL も通常請求とみなす）。
-- ============================================================

ALTER TABLE koseki_requests
  ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT '通常請求';

ALTER TABLE real_estate_acquisitions
  ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT '通常請求';

-- 経費の集計で「誤請求だけ」を引くので、案件×区分で引けるようにしておく
CREATE INDEX IF NOT EXISTS idx_koseki_requests_kind ON koseki_requests(case_id, request_kind);
CREATE INDEX IF NOT EXISTS idx_re_acquisitions_kind ON real_estate_acquisitions(case_id, request_kind);
