-- ============================================================
-- 064_case_clients.sql
-- 依頼者（同行者含む）を複数人登録できるようにする（追加のみ・非破壊）
--
--   1案件に複数の依頼者を登録。priority でメイン依頼人/同行者を識別。
--   既存の cases.client_id → clients（メイン依頼者）は互換のため維持し、
--   メイン依頼者は case_clients と clients の両方へ保存する。
-- ============================================================

CREATE TABLE IF NOT EXISTS case_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  furigana TEXT,
  priority TEXT NOT NULL DEFAULT 'main',   -- main（メイン依頼人） / companion（同行者）
  birth_date DATE,                          -- 生年月日（年齢はここから算出）
  relationship TEXT,                        -- 被相続人との続柄
  phone TEXT,
  email TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_clients_case ON case_clients(case_id);

ALTER TABLE case_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_clients_all ON case_clients;
CREATE POLICY case_clients_all ON case_clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER case_clients_updated_at
  BEFORE UPDATE ON case_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
