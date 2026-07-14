-- 到着物（受信）の郵送種別（〒の種類）。
-- 速達 / 簡易書留 / 赤レタパ（レターパックライト？→運用に合わせて赤=レターパックプラス）/ 青レタパ。
-- 封筒＝1受信単位なので、受信の親レコード document_receipts に持たせる（項目単位ではない）。
alter table document_receipts add column if not exists postal_type text;

comment on column document_receipts.postal_type is '郵送種別（〒の種類）: 速達 / 簡易書留 / 赤レタパ / 青レタパ';
