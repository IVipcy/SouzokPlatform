-- 不動産に「家屋番号」と「近傍宅地価格の要否」を追加。
-- これらは固定資産証明等申請書（名寄帳・評価証明）の各物件行にプリセットされる。
-- 所在（登記上の地番）は既存の lot_number を利用。

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS kaoku_bango TEXT,
  ADD COLUMN IF NOT EXISTS near_land_price TEXT;  -- '要' / '不要'

COMMENT ON COLUMN real_estate_properties.kaoku_bango IS '家屋番号（固定資産申請書の家屋行）';
COMMENT ON COLUMN real_estate_properties.near_land_price IS '近傍宅地価格の要否（要/不要）';
