-- 252: case_members.role に sub_manager を許す
--
-- migration 251 で管理担当を主・サブに分けたが、role に許す値のリスト
-- （001_initial_schema.sql の CHECK 制約）に sub_manager が入っていなかったため、
-- 画面からサブ管理担当を選ぶと登録できなかった。
--
-- sub_manager 自体はロール定義（constants.ts の ROLES）にもマイページ・アラートの
-- 宛先判定にも前からあり、case_members で使えないことだけが漏れていた。

alter table case_members drop constraint if exists case_members_role_check;
alter table case_members add constraint case_members_role_check
  check (role in ('sales', 'manager', 'sub_manager', 'assistant', 'lp', 'accounting'));
