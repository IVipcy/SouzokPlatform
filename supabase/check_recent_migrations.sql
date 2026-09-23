-- 直近のマイグレーションが当たっているかの確認（2026-09-23）。
--   psql "$DATABASE_URL" -f supabase/check_recent_migrations.sql
-- 「ng」が出た行のマイグレーションを当てる。

select '286 alert_states'            as migration, case when to_regclass('public.alert_states') is not null then 'ok' else 'ng' end as status
union all select '287 case_relations',       case when to_regclass('public.case_relations') is not null then 'ok' else 'ng' end
union all select '288 koseki_images.rotation', case when exists (select 1 from information_schema.columns where table_name='koseki_images' and column_name='rotation') then 'ok' else 'ng' end
union all select '289 visit_reservations_done', case when to_regclass('public.visit_reservations_done') is not null then 'ok' else 'ng' end
union all select '290 real_estate_properties.property_number', case when exists (select 1 from information_schema.columns where table_name='real_estate_properties' and column_name='property_number') then 'ok' else 'ng' end
union all select '291 progress_reports.next_action', case when exists (select 1 from information_schema.columns where table_name='progress_reports' and column_name='next_action') then 'ok' else 'ng' end
union all select '292 case_asset_estimates', case when to_regclass('public.case_asset_estimates') is not null then 'ok' else 'ng' end
union all select '293 cases.referral_client_id', case when exists (select 1 from information_schema.columns where table_name='cases' and column_name='referral_client_id') then 'ok' else 'ng' end
union all select '294 can_delete_case()',  case when to_regproc('public.can_delete_case') is not null then 'ok' else 'ng' end
union all select '295 dispatch-documents policy', case when exists (select 1 from pg_policies where schemaname='storage' and policyname='dispatch_documents_objects_all') then 'ok' else 'ng' end
union all select '296 integration_nonces', case when to_regclass('public.integration_nonces') is not null then 'ok' else 'ng' end
union all select '297 receipt seq lock', case when exists (select 1 from pg_proc where proname='assign_document_receipt_sequence' and prosrc like '%pg_advisory_xact_lock%') then 'ok' else 'ng' end
union all select '298 billing_expense_items.billed_invoice_id', case when exists (select 1 from information_schema.columns where table_name='billing_expense_items' and column_name='billed_invoice_id') then 'ok' else 'ng' end
union all select '299 referral_client FK dropped', case when not exists (select 1 from pg_constraint where conrelid='cases'::regclass and confrelid='clients'::regclass and conname <> 'cases_client_id_fkey') then 'ok' else 'ng' end;
