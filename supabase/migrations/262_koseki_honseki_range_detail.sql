-- 戸籍請求に「本籍・住所」と「請求範囲詳細」を持たせる。
--
-- どちらも戸籍請求書に印字する内容だが、実務タブには置き場が無く、請求書の出力画面で
-- 毎回入力していた。実務タブに書いたものがそのまま紙になるようにして、二重入力を無くす。
--
--   honseki_address … 請求書の「本籍・住所」欄。請求に係る者本人のもの。
--                     住民票・除票のときは住所、それ以外は本籍。
--   range_detail    … 請求書の「備考」欄に入れる文章。請求の種別に応じた定型文から選び、
--                     日付などを直して使う（例：○○さまの出生〜死亡までの一連の戸籍が必要です。）
alter table koseki_requests add column if not exists honseki_address text;
alter table koseki_requests add column if not exists range_detail text;

comment on column koseki_requests.honseki_address is '本籍・住所（戸籍請求書の本籍・住所欄）。住民票・除票のときは住所';
comment on column koseki_requests.range_detail is '請求範囲詳細（戸籍請求書の備考欄）。定型文から選んで編集する';

-- 使用目的（旧・戸籍請求理由）の選択肢を、戸籍請求書の使用目的欄に印字する言葉へ揃える。
-- 旧い3択は紙に載せるには長く、実際は出力画面で選び直していた。
update koseki_requests set request_reason = '相続人調査・相関図作成'
  where request_reason = '正確な相続人の把握と相続関係図の作成';
update koseki_requests set request_reason = '遺言書作成のため'
  where request_reason = '遺言書作成の前段として推定相続人の調査';
-- 旧「その他」は対応する使用目的が無いので、request_reason_other に書いた内容が残る形で空にする。
update koseki_requests set request_reason = null where request_reason = 'その他';
