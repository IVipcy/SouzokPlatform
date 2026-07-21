-- 物件の評価額確定ハンコに苗字を出すため confirmed_name 列を追加＋バックフィル
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS confirmed_name TEXT;

UPDATE real_estate_properties r
SET confirmed_name = m.name
FROM members m
WHERE r.confirmed_by = m.id
  AND r.confirmed_at IS NOT NULL
  AND (r.confirmed_name IS NULL OR r.confirmed_name = '');

NOTIFY pgrst, 'reload schema';
