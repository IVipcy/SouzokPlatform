-- ① 使用目的の選択肢を元の3つに戻す（migration 262 で短い言い回しへ寄せたのを取り消す）。
--
-- 262 では戸籍請求書に印字する短い言葉（相続人調査・相関図作成 等）へ寄せたが、
-- 運用で使うのは元の言い回しのほうだった。使用目的は選択＋自由入力にしたので、
-- 役所の紙に短く書きたいときはその場で直せる。
update koseki_requests set request_reason = '正確な相続人の把握と相続関係図の作成'
  where request_reason = '相続人調査・相関図作成';
update koseki_requests set request_reason = '遺言書作成の前段として推定相続人の調査'
  where request_reason = '遺言書作成のため';
-- 262 で「その他」を null にしていた場合、何だったかは戻せない。
-- request_reason_other に書いた内容は残っているので、そちらで判別する。

-- ② 実費請求法人。オーダーシートの契約形態の次に置き、戸籍請求の「請求法人」に映す。
--
-- 実費（戸籍の小為替など）を誰の名義で請求するかは案件で1つ決まるもので、
-- 請求ごとに変える性質ではない。だから戸籍カードでは選ばせず、ここの値を出す。
-- 契約形態（行・司連名 など）とは別。連名契約でも実費はどちらか一方の法人で請求する。
alter table cases add column if not exists expense_billing_firm text;

comment on column cases.expense_billing_firm is
  '実費請求法人（行政/司法/いきいき）。戸籍請求書などの実費を請求する法人名義';

-- 既存案件は契約形態から寄せる。連名は行政（行政書士法人が実費をまとめて請求する運用）。
update cases set expense_billing_firm = '行政'
  where expense_billing_firm is null and contract_type in ('行・司連名', '行政書士法人単独');
update cases set expense_billing_firm = '司法'
  where expense_billing_firm is null and contract_type = '司法書士法人単独';
update cases set expense_billing_firm = 'いきいき'
  where expense_billing_firm is null and contract_type = 'いきいきライフ協会';
