-- 289: 来店予約一覧（2026-09-22）
-- 金融機関への来店予約は Google スプレッドシート（来店カレンダー）で管理している。
-- システムはそのシートを「リンクを知っている全員が閲覧可」の CSV として読み、事務管理ダッシュボードの
-- 金融資産調査タブの中の「来店予約一覧」に出す。シートは書き換えない。
--   ・app_settings … シートの URL と列の指定（キー／値の小さな設定表。他の設定にも使える）
--   ・visit_reservations_done … 「来店準備完了」を押した行（一覧から消す）。行はシートの内容から作る鍵で覚える
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES members(id) ON DELETE SET NULL
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_all ON app_settings;
CREATE POLICY app_settings_all ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE app_settings IS 'システム設定（キー／値）。visits_sheet_url／visits_columns など。migration 289';

CREATE TABLE IF NOT EXISTS visit_reservations_done (
  row_key text PRIMARY KEY,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  done_by uuid REFERENCES members(id) ON DELETE SET NULL,
  done_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE visit_reservations_done ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visit_reservations_done_all ON visit_reservations_done;
CREATE POLICY visit_reservations_done_all ON visit_reservations_done FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMENT ON TABLE visit_reservations_done IS '来店予約一覧で「来店準備完了」を押した行（シートの行の鍵）。migration 289';

NOTIFY pgrst, 'reload schema';
