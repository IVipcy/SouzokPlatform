-- 286: アラートセンターの「新着／完了済」（2026-09-22）
-- アラート（/api/alerts が毎回計算する「やること」）は保存されない。人ごとに
--   ・初めて出た日時（新着順に並べる）
--   ・対応済にした日時（完了済タブへ移す。案件側で解消されれば一覧から消える）
-- だけをここに持つ。alert_key は AlertItem.id（task-{id} / prepay-{id} / case-{id}-{kind} など、同じ状態なら同じ値）。
CREATE TABLE IF NOT EXISTS alert_states (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  acked_at timestamptz,
  PRIMARY KEY (member_id, alert_key)
);
ALTER TABLE alert_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_states_all ON alert_states;
CREATE POLICY alert_states_all ON alert_states FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE alert_states IS 'アラートセンター：人ごとの初出日時と対応済（migration 286）';

NOTIFY pgrst, 'reload schema';
