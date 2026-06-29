-- ============================================================
-- 143_inventory_billing_settlement.sql
-- 財産目録・請求（報酬内訳/立替）・遺産承継（精算書/指図書）の土台。
-- 全フェーズで使う列・テーブルをまとめて用意する。
-- ============================================================

-- P1: 財産表に金額・評価額（目録/精算書の収入の源泉）
ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS balance_amount numeric,      -- 残高/評価額
  ADD COLUMN IF NOT EXISTS oc_transferred boolean NOT NULL DEFAULT false; -- オーシャンへ残高移管済（預金）
ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS appraisal_value numeric;     -- 評価額

-- P1: 財産目録（財産表から取込＋手動編集。協議書/精算書へ反映）
CREATE TABLE IF NOT EXISTS asset_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  asset_class text,            -- 財産区分（金融/不動産/その他）
  detail text,                 -- 詳細（預金/不動産評価/証券/信託/その他フリー）
  amount numeric,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_inventory_case ON asset_inventory(case_id, sort_order);

-- P2: 報酬内訳（司法/行政それぞれ。合計＝確定報酬）
CREATE TABLE IF NOT EXISTS reward_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  shigyo text NOT NULL DEFAULT '司法',  -- 司法 / 行政
  label text,                  -- 項目（基本料金 or 業務区分名）
  amount numeric NOT NULL DEFAULT 0,        -- 金額
  discount numeric NOT NULL DEFAULT 0,      -- 割引額
  note text,                   -- 備考（割引理由）
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reward_items_case ON reward_items(case_id, shigyo, sort_order);

-- P2: 立替実費（請求タブ専用）
CREATE TABLE IF NOT EXISTS billing_expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  shigyo text,                 -- 司法 / 行政（任意）
  label text,
  amount numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_expense_case ON billing_expense_items(case_id, sort_order);

-- P3: 精算書 収入（被相続人の財産）
CREATE TABLE IF NOT EXISTS settlement_income_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  asset_class text,            -- 金融 / 不動産 / その他
  detail text,
  amount numeric NOT NULL DEFAULT 0,
  oc_transferred boolean NOT NULL DEFAULT false, -- OC移管済（預金のみ）
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settlement_income_case ON settlement_income_items(case_id, sort_order);

-- P3: 精算書 支出（報酬/立替/代理支払）
CREATE TABLE IF NOT EXISTS settlement_expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind text,                   -- 報酬 / 立替 / 代理支払
  label text,
  amount numeric NOT NULL DEFAULT 0,
  source text,                 -- reward / expense / receipt / manual
  ref_id uuid,                 -- 連動元（reward_items 等）
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settlement_expense_case ON settlement_expense_items(case_id, sort_order);

-- P3: 指図書（相続人別の振込先）
CREATE TABLE IF NOT EXISTS instruction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  heir_id uuid REFERENCES heirs(id) ON DELETE SET NULL,
  heir_name text,
  bank_name text,
  branch_name text,
  account_no text,
  amount numeric,
  transferred boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instruction_items_case ON instruction_items(case_id, sort_order);

-- P4: 受信簿の代理支払（精算書へ反映）。お客様宛の支払請求書をオーシャンが支払う分。
ALTER TABLE document_receipt_items
  ADD COLUMN IF NOT EXISTS settlement_reflect boolean NOT NULL DEFAULT false, -- 精算書(代理支払)へ反映する
  ADD COLUMN IF NOT EXISTS settlement_amount numeric;                          -- 支払額

-- RLS（既存テーブルと同じく authenticated 全許可）
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_inventory','reward_items','billing_expense_items','settlement_income_items','settlement_expense_items','instruction_items']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
