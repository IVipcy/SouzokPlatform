-- ============================================================
-- 237_manual_chapters.sql
-- マニュアルの章（面談 / 受注 / 相続人調査 …）をユーザーが足したり消したりできるようにする。
--
-- これまではコード側の固定配列だったため、章を1つ増やすのに実装が要った。
-- 業務の区切りは運用しながら変わるので、テーブルに持たせて画面から編集できるようにする。
--
-- manual_steps.chapter は章の「名前」を持つ（IDではない）。
-- 章の名前を変えたら、その章のステップの chapter もまとめて書き換える（画面側で実施）。
-- ============================================================

CREATE TABLE IF NOT EXISTS manual_chapters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE manual_chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_chapters_all ON manual_chapters;
CREATE POLICY manual_chapters_all ON manual_chapters FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS manual_chapters_updated_at ON manual_chapters;
CREATE TRIGGER manual_chapters_updated_at
  BEFORE UPDATE ON manual_chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 初期値（面談から納品までの流れ順）。既にあれば触らない。
INSERT INTO manual_chapters (name, sort_order) VALUES
  ('面談', 10), ('受注', 20), ('相続人調査', 30), ('財産調査', 40), ('遺産分割', 50),
  ('相続登記', 60), ('解約手続', 70), ('請求・入金', 80), ('納品', 90), ('その他', 100)
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
