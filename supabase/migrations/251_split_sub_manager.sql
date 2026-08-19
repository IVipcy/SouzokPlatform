-- 251: 管理担当を「管理担当」と「サブ管理担当」に分ける
--
-- これまで担当者タブは1つの欄に管理担当を2名まで入れる作りだったが、
-- 1項目に2名という挙動が分かりにくく、どちらが主でどちらが引継ぎ・応援なのかも
-- データ上は区別できなかった。
--
-- case_members のロールには sub_manager が既にあり、マイページ・アラートの宛先・
-- サイドバーの出し分けでは扱われている。担当者タブだけが manager に2名入れていた。
-- 欄を2つに分け、2人目は sub_manager として持つ。
--
-- 既に2名入っている案件は、先にアサインされた方を管理担当（manager）として残し、
-- 後からアサインされた方をサブ管理担当（sub_manager）へ移す。

with ranked as (
  select id,
         row_number() over (partition by case_id order by assigned_at nulls last, created_at) as rn
  from case_members
  where role = 'manager'
)
update case_members cm
set role = 'sub_manager'
from ranked r
where cm.id = r.id and r.rn > 1;
