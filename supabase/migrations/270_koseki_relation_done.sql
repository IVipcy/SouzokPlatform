-- 戸籍の読込結果に「被相続人との関係戸籍 取得完了」を持たせる。
--
-- 届いた戸籍を読んで、その人と被相続人のつながりが全部たどれたかどうか。
-- 請求ごとに持つ（どの戸籍で揃ったかを記録に残すため）。
-- 人として揃ったかは「その人の請求のどれかにチェックがある」で判断する。
-- あとから追加請求が要ると分かったら、チェックを外して取り消す。
--
-- これが立つと、名寄せ請求・金融資産の資料請求・凍結依頼へ進める（Sheet3の依存関係）。
--
-- 最後の住所／最後の本籍地／現在住所は新しく持たない。
-- それぞれ cases.deceased_address / cases.deceased_registered_address / heirs.address と
-- 同じ事実なので、読込結果の欄からその列へ直接書く（二重管理を避ける）。
alter table koseki_requests add column if not exists relation_koseki_done boolean not null default false;

comment on column koseki_requests.relation_koseki_done is
  '被相続人との関係戸籍 取得完了。名寄せ・金融調査・凍結依頼の開始条件（Sheet3）';

create index if not exists idx_koseki_requests_relation_done
  on koseki_requests (case_id) where relation_koseki_done;
