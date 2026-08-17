-- 246: 相談相手（Sister / Brother）
--
-- チームの外にいるが面倒を見てくれる先輩を、本人がプロフィールで登録する。
-- 複数人を持てるので配列。逆方向（後輩一覧）は持たない＝本人が登録したものだけが正。
-- 報連相モーダルの通知先候補にチップとして出す。

alter table members
  add column if not exists mentor_ids uuid[] not null default '{}';

comment on column members.mentor_ids is '相談相手（Sister/Brother）。本人が自分で登録する members.id の配列。報連相の通知先候補に出る。';
