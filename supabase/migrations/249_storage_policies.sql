-- 249: ストレージ（添付ファイル）のRLSポリシーを作り直す
--
-- 東京リージョンへの移行では public / auth スキーマしか移しておらず、
-- storage スキーマのポリシーが移らなかった。バケットとファイル本体は
-- scripts/migrate-storage.mjs で service_role を使ってコピーしたため気づかず、
-- 画面からのアップロードだけが "new row violates row-level security policy" で失敗していた。
--
-- 対象は5バケット。avatars だけ公開（プロフィール画像を getPublicUrl で出すため）、
-- 残りは非公開でログイン済みユーザーのみ読み書き可。
-- 過去のマイグレーション（192 / 229 / 236）と同じ形にそろえてある。
-- documents / avatars はもともとダッシュボードで手作業で作っていたので、ここで定義に取り込む。

-- バケット（無ければ作る）
insert into storage.buckets (id, name, public) values
  ('avatars',       'avatars',       true),
  ('documents',     'documents',     false),
  ('koseki-images', 'koseki-images', false),
  ('manual-images', 'manual-images', false),
  ('meeting-memos', 'meeting-memos', false)
on conflict (id) do nothing;

-- ポリシー（ログイン済みならそのバケットを読み書きできる）
drop policy if exists avatars_objects_all       on storage.objects;
create policy avatars_objects_all       on storage.objects for all to authenticated
  using (bucket_id = 'avatars')       with check (bucket_id = 'avatars');

drop policy if exists documents_objects_all     on storage.objects;
create policy documents_objects_all     on storage.objects for all to authenticated
  using (bucket_id = 'documents')     with check (bucket_id = 'documents');

drop policy if exists koseki_images_objects_all on storage.objects;
create policy koseki_images_objects_all on storage.objects for all to authenticated
  using (bucket_id = 'koseki-images') with check (bucket_id = 'koseki-images');

drop policy if exists manual_images_objects_all on storage.objects;
create policy manual_images_objects_all on storage.objects for all to authenticated
  using (bucket_id = 'manual-images') with check (bucket_id = 'manual-images');

drop policy if exists meeting_memos_objects_all on storage.objects;
create policy meeting_memos_objects_all on storage.objects for all to authenticated
  using (bucket_id = 'meeting-memos') with check (bucket_id = 'meeting-memos');

-- 公開バケットは誰でも読めるようにする（プロフィール画像）
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select to anon
  using (bucket_id = 'avatars');

notify pgrst, 'reload schema';
