-- 証券の銘柄ごとに、信託銀行／株主名簿管理人を持たせる。
--
-- 同じ証券会社でも銘柄によって株主名簿管理人（信託銀行）が違い、
-- どこへ何を出すかが銘柄ごとに変わる。資料の到着日も銘柄ごとに違う。
-- 1行＝1銘柄で持てるようにする（行はもともと銘柄単位なので、列を足すだけ）。
alter table financial_assets add column if not exists registrar text;

comment on column financial_assets.registrar is
  '信託銀行／株主名簿管理人（証券の銘柄ごと）。同じ証券会社でも銘柄で変わる';
