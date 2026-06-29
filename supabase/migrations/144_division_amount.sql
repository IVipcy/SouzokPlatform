-- 分割内容に金額列（財産目録からコピー反映するため）。
ALTER TABLE division_details ADD COLUMN IF NOT EXISTS amount numeric;
