-- 金融資産の凍結確認・残高確定のハンコに苗字を出すため confirmed_name 列を追加＋バックフィル。
-- 不動産(confirmed_name)・戸籍(request_check_name/receipt_check_name)と同じ対応。
-- 既存は checked_at はあるが name が無く、ハンコが「—」表示になっていた。

ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS freeze_confirmed_name  TEXT,
  ADD COLUMN IF NOT EXISTS balance_confirmed_name TEXT;

COMMENT ON COLUMN financial_assets.freeze_confirmed_name  IS '凍結確認者の氏名（ハンコ表示用）';
COMMENT ON COLUMN financial_assets.balance_confirmed_name IS '残高確定者の氏名（ハンコ表示用）';

-- 既存行のバックフィル（confirmed_by から members.name を引く）
UPDATE financial_assets r
SET freeze_confirmed_name = m.name
FROM members m
WHERE r.freeze_confirmed_by = m.id
  AND r.freeze_confirmed_at IS NOT NULL
  AND (r.freeze_confirmed_name IS NULL OR r.freeze_confirmed_name = '');

UPDATE financial_assets r
SET balance_confirmed_name = m.name
FROM members m
WHERE r.balance_confirmed_by = m.id
  AND r.balance_confirmed_at IS NOT NULL
  AND (r.balance_confirmed_name IS NULL OR r.balance_confirmed_name = '');

NOTIFY pgrst, 'reload schema';
