-- 295: 古い受領ファイルのバケット dispatch-documents にストレージポリシーを足す（2026-09-23）
--
-- migration 031 より前に受信簿で受け取ったファイルは dispatch-documents バケットに入っている
-- （case_documents.received_file_bucket = 'dispatch-documents'）。
-- 249 でストレージのポリシーを作り直したとき、この古いバケットだけ対象から漏れていて、
-- 画面から開こうとすると権限エラーになっていた。
-- 他バケット（249）と同じ形で「ログイン済みなら読み書き可・非公開」にそろえる。
-- ファイルを documents へ移す案もあるが、行と実体を同時に動かす必要があり、ポリシー追加の方が安全。

insert into storage.buckets (id, name, public) values
  ('dispatch-documents', 'dispatch-documents', false)
on conflict (id) do nothing;

drop policy if exists dispatch_documents_objects_all on storage.objects;
create policy dispatch_documents_objects_all on storage.objects for all to authenticated
  using (bucket_id = 'dispatch-documents') with check (bucket_id = 'dispatch-documents');

notify pgrst, 'reload schema';

-- 確認：
-- select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch_documents_objects_all';
-- select id, public from storage.buckets where id = 'dispatch-documents';
