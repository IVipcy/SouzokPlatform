-- ============================================================
-- 236_manual_steps.sql
-- マニュアルの「操作ステップ」。PowerPointで作っていた
-- 「画面キャプチャ＋赤枠＋番号／右に操作方法」のページをシステム内で作れるようにする。
--
-- 1ステップ ＝ 1ページ。画面キャプチャは複数枚（縦に並ぶ）、赤枠は画像の上に何個でも置ける。
-- 赤枠の番号と、右の操作方法の番号は同じものを指す。番号は 1 から通しで自動採番する。
--
-- 画像の座標は画像の幅・高さに対する 0〜1 の割合で持つ（戸籍の書き込みと同じ考え方）。
-- 拡大しても印刷してもズレず、あとから画像だけ差し替えても枠の位置が保たれる。
--
-- shots（画面キャプチャ）:
--   [{ id, path, marks: [{ n, x, y, w, h }] }]
-- items（操作方法）:
--   [{ n, body, rule }]   rule = 業務ルール（任意。必要な手順にだけ付ける）
--
-- 読み物（考え方・ルールの説明）は従来どおり content/manual/*.md に置く。
-- ここは手順だけを持つ。両方を1つの目次から辿れるようにする。
-- ============================================================

CREATE TABLE IF NOT EXISTS manual_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 章（面談 / 受注 / 調査 / 遺産分割 / 相続登記 / 解約 / 請求 / 納品 など）
  chapter     text NOT NULL DEFAULT '未分類',
  title       text NOT NULL DEFAULT '',
  -- 誰向けの手順か（受注担当 / 管理担当 / 事務管理担当 / 経理 / 相続登記チーム）。空＝全員
  roles       text[] NOT NULL DEFAULT '{}',
  shots       jsonb  NOT NULL DEFAULT '[]'::jsonb,
  items       jsonb  NOT NULL DEFAULT '[]'::jsonb,
  sort_order  integer NOT NULL DEFAULT 0,
  updated_by  uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_steps_order ON manual_steps(chapter, sort_order);

ALTER TABLE manual_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_steps_all ON manual_steps;
CREATE POLICY manual_steps_all ON manual_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS manual_steps_updated_at ON manual_steps;
CREATE TRIGGER manual_steps_updated_at
  BEFORE UPDATE ON manual_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 画面キャプチャの保存バケット（非公開）。koseki-images と同じ運用。
INSERT INTO storage.buckets (id, name, public)
VALUES ('manual-images', 'manual-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS manual_images_objects_all ON storage.objects;
CREATE POLICY manual_images_objects_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'manual-images') WITH CHECK (bucket_id = 'manual-images');

NOTIFY pgrst, 'reload schema';
