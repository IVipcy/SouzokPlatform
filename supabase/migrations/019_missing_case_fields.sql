-- 019_missing_case_fields.sql
-- 案件詳細画面に不足していたケースレベルのフィールドを追加

-- cases: 遺言詳細
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_witness TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_content TEXT[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_bequest_handler TEXT;

-- cases: 信託追加
ALTER TABLE cases ADD COLUMN IF NOT EXISTS trust_final_beneficiary TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS trust_creation_place TEXT;

-- cases: 不動産査定
ALTER TABLE cases ADD COLUMN IF NOT EXISTS real_estate_appraisal_status TEXT;

-- real_estate_properties: 評価・売却関連
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS evaluation_method TEXT;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS is_condo_land BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS sale_agent_name TEXT;

-- financial_assets: 解約・通帳管理
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS dissolution_status TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS passbook_status TEXT;
