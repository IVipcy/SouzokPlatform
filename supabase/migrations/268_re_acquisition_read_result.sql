-- 不動産の取得資料に「読込結果」を持たせる。
--
-- 名寄帳は「この市区町村にある物件を洗い出す」ために取るのに、読んだ結果を書く場所が
-- 無かった。私道の持分や共有物件を見落とすと、そのまま登記が漏れる。
-- 戸籍の読込結果（migration 261）と同じ形にして、取得完了か一部不足かを残す。
--
-- 値: '取得完了' | '一部不足'（NULL＝まだ読んでいない）
alter table real_estate_acquisitions add column if not exists read_status text;
alter table real_estate_acquisitions add column if not exists read_result text;

comment on column real_estate_acquisitions.read_status is
  '読込結果のステータス。取得完了 / 一部不足。NULLは未確認';
comment on column real_estate_acquisitions.read_result is
  '読込結果の内容。名寄帳で見つかった物件、足りなかった資料など';
