-- 287: 関連案件（2026-09-22）
-- 同じ家の別案件（兄弟が別々に依頼した・二次相続・先に受けた不動産案件 等）を案件どうしで結ぶ。
--   ・1行＝1つの結び（向きはない。どちらの案件から見ても同じ関連として出す）
--   ・note は一言メモ（「二次相続」「兄の案件」など）
--   ・同じ2案件の結びは1つだけ（向きを入れ替えた重複は画面側で弾く）
CREATE TABLE IF NOT EXISTS case_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  related_case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  note text,
  created_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_relations_not_self CHECK (case_id <> related_case_id),
  CONSTRAINT case_relations_unique UNIQUE (case_id, related_case_id)
);
CREATE INDEX IF NOT EXISTS case_relations_case_idx ON case_relations(case_id);
CREATE INDEX IF NOT EXISTS case_relations_related_idx ON case_relations(related_case_id);
ALTER TABLE case_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_relations_all ON case_relations;
CREATE POLICY case_relations_all ON case_relations FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE case_relations IS '関連案件（案件どうしの結び。向きなし。migration 287）';

NOTIFY pgrst, 'reload schema';
