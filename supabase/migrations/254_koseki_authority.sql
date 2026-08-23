-- 254: 戸籍を委任状で取ったか職務上請求で取ったかを記録する
--
-- 職務上請求用紙を使ったときは、行政書士法・司法書士法で事件簿の備え付けが要る。
-- どの用紙をどの請求に使ったかを残さないと事件簿が書けないため、
-- 請求1件ごと（依頼書1枚ごと）に取得方法と用紙の番号を持たせる。
--
--   オーダーシート（koseki_plans）… これからどちらで取るかの指示。人ごと
--   実務タブ（koseki_requests）  … 実際にどちらで取ったかの記録。依頼書1枚ごと（こちらが正）

-- 実務タブ：記録用
alter table koseki_requests
  add column if not exists acquisition_authority text,   -- 委任状 / 職務上請求
  add column if not exists authority_form_no     text;   -- 職務上請求用紙の番号（半角数字）

comment on column koseki_requests.acquisition_authority is '戸籍の取得方法（委任状／職務上請求）。事件簿の対象を拾うのに使う';
comment on column koseki_requests.authority_form_no is '使用した職務上請求用紙の番号。職務上請求のときだけ入る';

-- オーダーシート：指示用
alter table koseki_plans
  add column if not exists acquisition_authority text;   -- 委任状 / 職務上請求

comment on column koseki_plans.acquisition_authority is '戸籍の取得方法の見立て（委任状／職務上請求）。実務タブの初期値になる';
