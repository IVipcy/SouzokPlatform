-- ============================================================
-- setup_avatars_bucket.sql
-- プロフィール画像（Phase A）用の Supabase Storage 設定
--
-- 使い方:
--   Supabase ダッシュボード → SQL Editor → New query →
--   このファイルの中身を貼って Run
--
-- ※ migration ではなく一度きりのセットアップ。
--    storage スキーマは Supabase 側が管理しているため、
--    アプリの migrations フォルダではなく独立して置いている。
-- ============================================================

-- 1. avatars バケット作成（公開・読み取り誰でもOK）
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. ポリシー: 認証ユーザーは誰でもアップロード可
DROP POLICY IF EXISTS "avatars_authenticated_upload" ON storage.objects;
CREATE POLICY "avatars_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- 3. ポリシー: 認証ユーザーは更新可
DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
CREATE POLICY "avatars_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

-- 4. ポリシー: 認証ユーザーは削除可
DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;
CREATE POLICY "avatars_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');

-- 5. ポリシー: 公開読み取り（非ログインでも画像URLを開ける）
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
