-- 294_rls_hardening.sql
-- 権限の穴を塞ぐ（不具合監査 2026-09-23 S1〜S3）。
--   S1 members の UPDATE/INSERT が全員に開いていて、自分の primary_role を system_manager に書き換えられた
--   S2 member_roles が FOR ALL true で、自分に役割を足せた
--   S3 cases の DELETE が全員に開いていた
--
-- 方針：
--   ・「いまログインしている人」は members.email = JWT の email で引く（アプリの getCurrentUser と同じ突合）
--   ・members は 本人の行 か システム管理者 だけ更新可。ただし本人でも 役割・メール・在籍 はトリガーで変更不可
--   ・member_roles の書き込みはシステム管理者だけ
--   ・cases の削除は システム管理者 ／ 下書き(intake_draft) ／ 受注前の案件で自分がメンバー のときだけ
--     （受注以降の案件は取引・請求が乗るので、消せるのはシステム管理者のみ）
--   ・service_role（サーバー側・psql）は RLS の外なので影響なし

-- いまの利用者の members.id（見つからなければ null）
CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id FROM members m
  WHERE m.email = (auth.jwt() ->> 'email') AND m.is_active = true
  ORDER BY m.created_at NULLS LAST
  LIMIT 1
$$;

-- いまの利用者がシステム管理者か（primary_role か member_roles のどちらか）
CREATE OR REPLACE FUNCTION public.is_system_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members m
    WHERE m.email = (auth.jwt() ->> 'email') AND m.is_active = true AND m.primary_role = 'system_manager'
  ) OR EXISTS (
    SELECT 1 FROM members m
    JOIN member_roles mr ON mr.member_id = m.id
    JOIN roles r ON r.id = mr.role_id
    WHERE m.email = (auth.jwt() ->> 'email') AND m.is_active = true AND r.key = 'system_manager'
  )
$$;

-- ========== S1 members ==========
DROP POLICY IF EXISTS "members_insert" ON members;
DROP POLICY IF EXISTS "members_update" ON members;
CREATE POLICY "members_insert" ON members FOR INSERT TO authenticated
  WITH CHECK (public.is_system_manager());
CREATE POLICY "members_update" ON members FOR UPDATE TO authenticated
  USING (public.is_system_manager() OR email = (auth.jwt() ->> 'email'))
  WITH CHECK (public.is_system_manager() OR email = (auth.jwt() ->> 'email'));

-- 本人でも 役割・メール・在籍 は変えられない（プロフィール画面で直せるのは名前・色・チーム等だけ）
CREATE OR REPLACE FUNCTION public.guard_member_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.is_system_manager() THEN
    IF NEW.primary_role IS DISTINCT FROM OLD.primary_role
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION '役割・メールアドレス・在籍の変更はシステム管理者だけができます' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS members_guard_sensitive ON members;
CREATE TRIGGER members_guard_sensitive
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_sensitive_columns();

-- ========== S2 member_roles ==========
DROP POLICY IF EXISTS "member_roles_all" ON member_roles;
CREATE POLICY "member_roles_insert" ON member_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_system_manager());
CREATE POLICY "member_roles_update" ON member_roles FOR UPDATE TO authenticated
  USING (public.is_system_manager());
CREATE POLICY "member_roles_delete" ON member_roles FOR DELETE TO authenticated
  USING (public.is_system_manager());
-- 参照（member_roles_select）は既存のまま全員可

-- ========== S3 cases の削除 ==========
-- 受注以降のステータス（ここ以降は請求・入金が乗る）
CREATE OR REPLACE FUNCTION public.can_delete_case(p_case_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_system_manager()
    OR EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = p_case_id
        AND (
          COALESCE(c.intake_draft, false)
          OR (
            c.status NOT IN ('受注', '戻り受注', '作業着手準備', '対応中', '完了', '納品完了')
            AND EXISTS (SELECT 1 FROM case_members cm WHERE cm.case_id = c.id AND cm.member_id = public.current_member_id())
          )
        )
    )
$$;
GRANT EXECUTE ON FUNCTION public.can_delete_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_system_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;

DROP POLICY IF EXISTS "cases_delete" ON cases;
CREATE POLICY "cases_delete" ON cases FOR DELETE TO authenticated
  USING (public.can_delete_case(id));

-- 確認：
--   select polname, cmd, qual from pg_policies where tablename in ('members','member_roles','cases') order by tablename, polname;
--   select public.is_system_manager();  -- psql からは null 扱い（false）
