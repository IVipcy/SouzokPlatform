-- ============================================================
-- 038_sales_targets.sql
-- 受注担当ダッシュボード（サマリ）で使う月次目標値を保持するテーブル。
--   - ym ごとに 1 行
--   - 6 指標: 当月面談数 / 当月新規受注件数 / 受注率 / 平均受注単価 / 相続税申告件数 / 不動産査定件数
--   - avg_order_unit は「円」で保存（UI 側で万円に変換）
--   - conversion_rate は 0..100 の % 値
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ym TEXT NOT NULL UNIQUE,                          -- 'YYYY-MM'
  meetings_count INT NOT NULL DEFAULT 0,            -- 当月面談数（件）
  new_orders_count INT NOT NULL DEFAULT 0,          -- 当月新規受注件数（件）
  conversion_rate NUMERIC(4,1) NOT NULL DEFAULT 0,  -- 受注率（%, 0..100）
  avg_order_unit BIGINT NOT NULL DEFAULT 0,         -- 平均受注単価（円）
  tax_filing_count INT NOT NULL DEFAULT 0,          -- 相続税申告件数（件）
  property_appraisal_count INT NOT NULL DEFAULT 0,  -- 不動産査定件数（件）
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_ym ON sales_targets(ym);

ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_targets_select_authenticated" ON sales_targets;
CREATE POLICY "sales_targets_select_authenticated" ON sales_targets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sales_targets_modify_authenticated" ON sales_targets;
CREATE POLICY "sales_targets_modify_authenticated" ON sales_targets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at の自動更新
CREATE OR REPLACE FUNCTION update_sales_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_targets_updated_at ON sales_targets;
CREATE TRIGGER trg_sales_targets_updated_at
  BEFORE UPDATE ON sales_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_targets_updated_at();
