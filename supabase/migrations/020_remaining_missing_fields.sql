-- 020_remaining_missing_fields.sql
-- オーダーシート比較で残っていた不足フィールドを追加

-- cases: 財産目録・信託記載内容・その他
ALTER TABLE cases ADD COLUMN IF NOT EXISTS inventory_categories TEXT[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS trust_content TEXT[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_draft_confirmed_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS financial_survey_start_condition TEXT;

-- real_estate_properties: 地積測量図・路線価・売却時期
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS has_survey_map BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS has_route_price BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS sale_expected_date DATE;

-- financial_assets: 証券関連・新口座
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS houri_inquiry BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS odd_lot_handling TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS unclaimed_dividend TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS new_account_found_date DATE;
