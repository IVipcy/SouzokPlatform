-- オーダーシートの各行に優先度（通常/急ぎ/超急ぎ）を持たせる。
--
-- 事務管理担当がタスクを作るとき、どれから手を付けるかの見立てが受注担当から
-- 伝わっていなかった。行ごとに書いておけるようにする。
-- タスクの優先度を自動で書き換えることはしない。作る人がこれを見て決める。
--
-- 値は tasks.priority と同じ言葉（通常/急ぎ/超急ぎ）。NULL＝未設定＝通常扱い。

-- 戸籍の取得計画（対象者ごと）
alter table koseki_plans add column if not exists priority text;
comment on column koseki_plans.priority is '優先度（通常/急ぎ/超急ぎ）。戸籍取得の見立て';

-- 金融資産。資料の取得と解約は同じ行を見ているので、優先度は別々に持つ。
-- 「残高証明は普通でいいが解約は急ぎ」が実際にあるため、1つにまとめない。
alter table financial_assets add column if not exists survey_priority text;
alter table financial_assets add column if not exists cancel_priority text;
comment on column financial_assets.survey_priority is '優先度（通常/急ぎ/超急ぎ）。残高証明などの資料取得';
comment on column financial_assets.cancel_priority is '優先度（通常/急ぎ/超急ぎ）。解約手続';

-- 不動産の取得（名寄帳・固定資産評価証明・登記情報）
alter table real_estate_acquisitions add column if not exists priority text;
comment on column real_estate_acquisitions.priority is '優先度（通常/急ぎ/超急ぎ）。不動産資料の取得';
