-- 247: 相続ステーションから来た案件は「面談登録したものだけ」を案件にする
--
-- これまで：連携で受信した時点で案件を作り、案件管理番号(2608LP0001)まで振っていた。
--           ステータスが「面談設定済」なので相談案件一覧にも自動で並び、
--           オーシャンが担当しない案件まで一覧を埋め、番号も消費していた。
--
-- これから：受信した案件は intake_draft=true（＝一覧・KPI から除外）で入れ、番号は振らない。
--           面談登録アプリ（/intake）でLP直案件として選び、入力した時点で番号を採番し、
--           ②面談結果登録の保存で intake_draft=false ＝ 正式な相談案件に昇格する。
--           これは OC直・HP経由の下書き（migration 194）と同じ仕組み。

-- 番号は後から振るので NULL を許す（UNIQUE は残す。Postgres の UNIQUE は NULL を重複と見なさない）
alter table cases alter column case_number drop not null;

comment on column cases.case_number is
  '案件管理番号 YYMM+経路コード+当日連番。連携で受信しただけの案件は NULL（面談登録で採番）。';

-- 既に受信済みで、まだ面談登録に手が付いていないものを受信箱へ戻す。
--   ・担当が付いている／面談担当が入っている／面談シートを書き始めている ものは対象外（触った案件は残す）
update cases c
set intake_draft = true,
    case_number = null
where c.lp_case_number is not null
  and c.status = '面談設定済'
  and coalesce(c.intake_draft, false) = false
  and c.meeting_owner_id is null
  and c.meeting_executed_date is null
  and not exists (select 1 from case_members m where m.case_id = c.id)
  and not exists (select 1 from meeting_memos mm where mm.case_id = c.id)
  and not exists (select 1 from heirs h where h.case_id = c.id);
