-- migration 051: 進捗報告（進捗確認依頼）機能
--
-- 週1回、管理担当が受注担当（または別の先輩・同僚＝確認者）に案件進捗の確認を依頼する。
-- 依頼を受けた「確認者」本人が「確認済」にしないと完了しない（自己申告での不正報告を防ぐ）。
--
-- ステータス: 依頼中 / 確認済 の2値。
--   「未対応」= 開いている依頼が無い状態（行が存在しない）としてアプリ側で算出する。

CREATE TABLE IF NOT EXISTS progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES members(id),   -- 依頼した管理担当
  confirmer_id UUID NOT NULL REFERENCES members(id),   -- 確認者（受注担当 or 先輩・同僚）
  requested_date DATE NOT NULL DEFAULT CURRENT_DATE,   -- 進捗確認依頼日
  status TEXT NOT NULL DEFAULT '依頼中' CHECK (status IN ('依頼中', '確認済')),
  confirmed_date DATE,                                 -- 確認日付（確認済になった日。システム日付）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1案件に同時に開ける「依頼中」は1件まで（重複依頼を防止）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_progress_open ON progress_reports(case_id) WHERE status = '依頼中';
CREATE INDEX IF NOT EXISTS idx_progress_reports_case ON progress_reports(case_id);
CREATE INDEX IF NOT EXISTS idx_progress_reports_confirmer ON progress_reports(confirmer_id);
CREATE INDEX IF NOT EXISTS idx_progress_reports_status ON progress_reports(status);

ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progress_reports_all ON progress_reports;
CREATE POLICY progress_reports_all ON progress_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER progress_reports_updated_at
  BEFORE UPDATE ON progress_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
