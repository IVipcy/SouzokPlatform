-- 確認簿：依頼→確認モデル（A案）＋確認履歴（監査ログ）
-- ────────────────────────────────────────────────────────────
-- 各行に「確認依頼を出した時刻・依頼者」を持たせる。確認簿は
-- 「依頼済み＆未確認」だけを受信箱として出す（値や日付だけでは上げない）。
-- 確認(✓/確定/承認/凍結確認)を押した瞬間に confirm_events へ追記して履歴に残す。

-- 戸籍請求：発送チェック依頼／着（到着確認）チェック依頼
ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS request_check_requested_at TIMESTAMPTZ;
ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS request_check_requested_by UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS receipt_check_requested_at TIMESTAMPTZ;
ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS receipt_check_requested_by UUID REFERENCES members(id) ON DELETE SET NULL;

-- 不動産・取得資料：発送／着
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS request_check_requested_at TIMESTAMPTZ;
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS request_check_requested_by UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS receipt_check_requested_at TIMESTAMPTZ;
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS receipt_check_requested_by UUID REFERENCES members(id) ON DELETE SET NULL;

-- 物件：評価額確定依頼
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS confirm_requested_at TIMESTAMPTZ;
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS confirm_requested_by UUID REFERENCES members(id) ON DELETE SET NULL;

-- 金融：残高確定依頼／口座凍結確認依頼
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS balance_confirm_requested_at TIMESTAMPTZ;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS balance_confirm_requested_by UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS freeze_confirm_requested_at TIMESTAMPTZ;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS freeze_confirm_requested_by UUID REFERENCES members(id) ON DELETE SET NULL;

-- 確認履歴（監査ログ・追記専用）。元行を後で変更・削除しても履歴は当時のまま残す。
CREATE TABLE IF NOT EXISTS confirm_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID REFERENCES cases(id) ON DELETE SET NULL,
  case_number    TEXT,                 -- スナップショット
  case_name      TEXT,                 -- スナップショット
  gyomu          TEXT,                 -- 戸籍 / 不動産 / 金融
  kind           TEXT,                 -- 発送✓ / 着✓ / 残高の確定 / 評価額の確定 / 口座凍結確認 / 追加請求の承認
  action         TEXT,                 -- koseki_send 等の機械種別
  target         TEXT,                 -- 請求先 / 対象
  content        TEXT,                 -- 内容
  amount         NUMERIC,              -- 費用/金額（スナップショット）
  requested_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  requested_by_name TEXT,
  requested_at   TIMESTAMPTZ,
  checked_by     UUID REFERENCES members(id) ON DELETE SET NULL,
  checked_by_name TEXT,
  checked_at     TIMESTAMPTZ DEFAULT now(),
  source_table   TEXT,                 -- koseki_requests 等
  source_row_id  UUID,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_confirm_events_checked_at ON confirm_events (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_confirm_events_case ON confirm_events (case_id);
CREATE INDEX IF NOT EXISTS idx_confirm_events_checked_by ON confirm_events (checked_by);
