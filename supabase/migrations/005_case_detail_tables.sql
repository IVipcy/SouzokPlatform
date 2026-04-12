-- ============================================================
-- 案件詳細ページ充実化のための追加テーブル・カラム
-- ============================================================

-- =========================
-- 1. cases テーブルへのカラム追加
-- =========================

-- 被相続人追加情報
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deceased_furigana TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deceased_birth_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deceased_address TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deceased_registered_address TEXT;

-- 遺産分割情報
ALTER TABLE cases ADD COLUMN IF NOT EXISTS division_policy TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS division_proposal TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS agreement_signing_method TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS inheritance_risk TEXT;

-- 遺言情報
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_type TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_storage TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_execution TEXT;

-- 契約・報酬情報
ALTER TABLE cases ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS contract_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS fee_administrative BIGINT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS fee_judicial BIGINT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS fee_total BIGINT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payment_status TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS fee_real_estate BIGINT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS fee_tax_referral BIGINT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS total_revenue_estimate BIGINT;

-- =========================
-- 2. 新テーブル
-- =========================

-- 相続人
CREATE TABLE heirs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  furigana TEXT,
  relationship TEXT,
  address TEXT,
  registered_address TEXT,
  phone TEXT,
  email TEXT,
  is_legal_heir BOOLEAN DEFAULT true,
  birth_date DATE,
  notes TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 不動産詳細
CREATE TABLE real_estate_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  property_type TEXT,
  address TEXT,
  lot_number TEXT,
  resident_status TEXT,
  area_evaluation TEXT,
  building_age INT,
  sale_intention TEXT,
  has_title_deed BOOLEAN DEFAULT false,
  has_tax_notice BOOLEAN DEFAULT false,
  name_consolidation_dest TEXT,
  evaluation_cert_dest TEXT,
  has_registry_info BOOLEAN DEFAULT false,
  has_cadastral_map BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 金融資産
CREATE TABLE financial_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  branch_name TEXT,
  required_docs TEXT[],
  existence_check TEXT,
  balance_cert_date TEXT,
  transaction_history_period TEXT,
  safe_deposit_box TEXT,
  stock_name TEXT,
  additional_info JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 分割内容
CREATE TABLE division_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  asset_category TEXT NOT NULL,
  division_method TEXT,
  recipient TEXT,
  share_ratio TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 立替実費
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  expense_date DATE,
  related_task TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================
-- 3. インデックス
-- =========================
CREATE INDEX idx_heirs_case ON heirs(case_id);
CREATE INDEX idx_real_estate_case ON real_estate_properties(case_id);
CREATE INDEX idx_financial_assets_case ON financial_assets(case_id);
CREATE INDEX idx_division_details_case ON division_details(case_id);
CREATE INDEX idx_expenses_case ON expenses(case_id);

-- =========================
-- 4. トリガー
-- =========================
CREATE TRIGGER heirs_updated_at
  BEFORE UPDATE ON heirs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
