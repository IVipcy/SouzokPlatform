-- 戸籍請求の「請求法人（行政/司法/いきいき）」を「拠点」に置き換える。
--
-- 請求書のどの様式で出すか（行政書士／司法書士／いきいき）は、契約形態から出力画面が
-- 決めている。一方で紙に載る住所・電話は拠点で決まるのに、実務タブには置き場が無く、
-- 出力画面で毎回選んでいた。カードに拠点を持たせて、そのまま紙になるようにする。
--
-- 値は officeProfiles.ts の拠点ID（kyodo / kureator / fujisawa / shibuya）。
alter table koseki_requests add column if not exists branch_office text;

comment on column koseki_requests.branch_office is
  '拠点（kyodo=共同ビル / kureator=クレアトール / fujisawa=藤沢 / shibuya=渋谷）。戸籍請求書の代理人欄の住所・電話に使う';

-- 旧・請求法人からの移し替え。各法人の本店がある拠点に寄せる（officeProfiles.ts の note と同じ）。
--   行政     … 行政書士法人本店     = クレアトール
--   司法     … 司法書士法人本店     = 共同ビル
--   いきいき … いきいきライフ協会本社 = 共同ビル
update koseki_requests set branch_office = 'kureator' where branch_office is null and request_firm = '行政';
update koseki_requests set branch_office = 'kyodo'    where branch_office is null and request_firm in ('司法', 'いきいき');

-- request_firm は消さずに残す。過去にどの法人名義で請求したかの記録で、
-- 拠点とは別の情報のため（画面には出さない）。
