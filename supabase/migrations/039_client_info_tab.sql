-- ============================================================
-- 039_client_info_tab.sql
-- 案件詳細「依頼者情報」タブ用の DB スキーマ追加。
--   1. cases に client_trait / client_trait_detail / has_complaint / complaint_detail を追加
--   2. client_communications テーブル新設（依頼者とのやり取り履歴）
-- ============================================================

-- =========================
-- 1. cases 拡張
--   - client_trait        : 依頼者特徴（'smile' / 'neutral' / 'angry'）
--   - client_trait_detail : 依頼者特徴詳細（性格メモなど）
--   - has_complaint       : クレーム有無（true=紫フラグ対象）
--   - complaint_detail    : クレーム内容
-- =========================
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS client_trait TEXT
    CHECK (client_trait IS NULL OR client_trait IN ('smile', 'neutral', 'angry'));
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_trait_detail TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS has_complaint BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS complaint_detail TEXT;

-- has_complaint = true の案件を素早く拾うためのインデックス（紫KPI集計用）
CREATE INDEX IF NOT EXISTS idx_cases_has_complaint
  ON cases(has_complaint)
  WHERE has_complaint = true;

-- =========================
-- 2. client_communications テーブル新設
--   - case_id          : 案件への参照
--   - communicated_at  : 連絡日
--   - communication_type : 連絡内容（5択 + フリー入力）
--   - detail           : やり取り詳細（フリーテキスト）
--   - status           : 'お客様待ち' / '完了'
--
--   - 受注/対応中ステータスの案件で、最新の communicated_at が
--     2週間以上前のとき「要進捗連絡」マークをヘッダーに表示するために使う。
-- =========================
CREATE TABLE IF NOT EXISTS client_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  communicated_at DATE NOT NULL,
  communication_type TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'お客様待ち'
    CHECK (status IN ('お客様待ち', '完了')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_communications_case
  ON client_communications(case_id, communicated_at DESC);

ALTER TABLE client_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_communications_select_authenticated" ON client_communications;
CREATE POLICY "client_communications_select_authenticated" ON client_communications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "client_communications_modify_authenticated" ON client_communications;
CREATE POLICY "client_communications_modify_authenticated" ON client_communications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at の自動更新
CREATE OR REPLACE FUNCTION update_client_communications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_communications_updated_at ON client_communications;
CREATE TRIGGER trg_client_communications_updated_at
  BEFORE UPDATE ON client_communications
  FOR EACH ROW
  EXECUTE FUNCTION update_client_communications_updated_at();
