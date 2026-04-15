-- 生命保険の「保険種類・金額」を種類と金額に分離
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS life_insurance_type TEXT,
  ADD COLUMN IF NOT EXISTS life_insurance_amount NUMERIC;

COMMENT ON COLUMN cases.life_insurance_type IS '生命保険の種類（終身/定期等）';
COMMENT ON COLUMN cases.life_insurance_amount IS '生命保険金額';
