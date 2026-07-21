-- 不動産取得資料の確認名バックフィル。
-- 既存バグ：ConfirmClient側で re_send/re_recv 時に request_check_name/receipt_check_name を保存し漏れていた。
-- checked_at は入っているが check_name が空 → ハンコが「—」表示になる。members テーブルから名前を引いて埋める。

UPDATE real_estate_acquisitions r
SET request_check_name = m.name
FROM members m
WHERE r.request_check_by = m.id
  AND r.request_check_at IS NOT NULL
  AND (r.request_check_name IS NULL OR r.request_check_name = '');

UPDATE real_estate_acquisitions r
SET receipt_check_name = m.name
FROM members m
WHERE r.receipt_check_by = m.id
  AND r.receipt_check_at IS NOT NULL
  AND (r.receipt_check_name IS NULL OR r.receipt_check_name = '');
