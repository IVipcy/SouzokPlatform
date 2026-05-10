-- ============================================================
-- setup_dispatch_documents_bucket.sql
-- 書類発着管理簿の受領書類アップロード用 Supabase Storage 設定
--
-- 使い方:
--   Supabase ダッシュボード → SQL Editor → New query →
--   このファイルの中身を貼って Run
--
-- ※ 個人情報を含む書類スキャンを保管するため、
--    avatars バケットと違い public: false（認証ユーザーのみアクセス可）。
-- ============================================================

-- 1. dispatch-documents バケット作成（非公開）
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispatch-documents', 'dispatch-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. 認証ユーザー: アップロード可
DROP POLICY IF EXISTS "dispatch_documents_authenticated_upload" ON storage.objects;
CREATE POLICY "dispatch_documents_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dispatch-documents');

-- 3. 認証ユーザー: 取得可（署名URL生成のため）
DROP POLICY IF EXISTS "dispatch_documents_authenticated_select" ON storage.objects;
CREATE POLICY "dispatch_documents_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dispatch-documents');

-- 4. 認証ユーザー: 更新可
DROP POLICY IF EXISTS "dispatch_documents_authenticated_update" ON storage.objects;
CREATE POLICY "dispatch_documents_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'dispatch-documents');

-- 5. 認証ユーザー: 削除可
DROP POLICY IF EXISTS "dispatch_documents_authenticated_delete" ON storage.objects;
CREATE POLICY "dispatch_documents_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'dispatch-documents');
