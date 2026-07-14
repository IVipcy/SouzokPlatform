-- 案件ごとの請求パターン（案件単位で1つ）
--   staged       … ① 段階請求（通常）：前受金＋確定請求＋立替実費
--   lump_expense … ② 一括＋実費：前受金で確定分も受領（確定請求なし）＋立替実費は後日
--   lump_only    … ③ 一括のみ：前受金で完結（確定請求・立替実費なし）
-- ②③の「一括」は前受金に確定請求ぶんを含めて一度に受領すること。既定は① staged（現行動作）。
alter table cases
  add column if not exists billing_pattern text not null default 'staged';

alter table cases
  drop constraint if exists cases_billing_pattern_check;
alter table cases
  add constraint cases_billing_pattern_check
  check (billing_pattern in ('staged', 'lump_expense', 'lump_only'));
