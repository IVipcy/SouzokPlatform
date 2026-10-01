-- 300: members.email の空白・改行・大文字を取り除く（2026-10-01）
--
-- ログインした人とメンバー表は「メールアドレスが一字一句同じ」で突き合わせている（getCurrentUser / migration 294 の関数）。
-- Table Editor で行を足したとき、メールの末尾に改行やタブ・全角空白が紛れ込むと、見た目は同じでも一致せず、
-- ログインしても名前も役割も出ない（「メンバー未設定」扱い）状態になっていた。
--
--   1) いま入っている行を掃除する（空白類をすべて除き、小文字に）
--   2) 今後は保存のたびに同じ掃除をするトリガーを付ける（貼り付けで紛れ込んでも一致する）

-- 1) 既存の行
UPDATE members
SET email = lower(regexp_replace(email, '[[:space:]　]+', '', 'g'))
WHERE email IS NOT NULL
  AND email <> lower(regexp_replace(email, '[[:space:]　]+', '', 'g'));

-- 2) 保存時に必ず掃除する
CREATE OR REPLACE FUNCTION public.normalize_member_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(regexp_replace(NEW.email, '[[:space:]　]+', '', 'g'));
  END IF;
  RETURN NEW;
END
$$;

-- 294 の「役割・メール・在籍は本人でも変えられない」トリガーより先に走らせる（トリガーは名前順）。
-- 掃除で値が変わらなければ 294 側は何も言わない。
DROP TRIGGER IF EXISTS members_a_normalize_email ON members;
CREATE TRIGGER members_a_normalize_email
  BEFORE INSERT OR UPDATE OF email ON members
  FOR EACH ROW EXECUTE FUNCTION public.normalize_member_email();

-- 確認（0行ならOK。ログインできるのにメンバー表とつながっていない人）：
--   select u.email from auth.users u left join members m on m.email = lower(u.email) and m.is_active where m.id is null;
