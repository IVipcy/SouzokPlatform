-- 預貯金口座に「口座種別」列を追加（普通/定期/当座/積立/貯蓄/その他）
-- 同じ金融機関(institution_name)配下に複数口座がある場合、種別で判別する。
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS account_type TEXT;
COMMENT ON COLUMN financial_assets.account_type IS '口座種別（普通/定期/当座/積立/貯蓄/その他）';

NOTIFY pgrst, 'reload schema';
