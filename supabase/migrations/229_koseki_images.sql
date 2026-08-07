-- ============================================================
-- 229_koseki_images.sql
-- 戸籍のスキャン画像と、その上の書き込み（マーカー・メモ）。
--
-- 元画像には一切書き込まない。書いた内容は annotations に別で持ち、
-- 開くたびに画像の上へ重ねて表示する。
--   ・原本のスキャンがそのまま残る（戸籍は見た目そのものが根拠になる）
--   ・何度でも消せる・直せる・あとから別の人が書き足せる
--   ・ダウンロードのときだけ書き込み済みの画像を作る
--
-- 座標は画像の幅・高さに対する 0〜1 の割合で持つ。
-- 拡大・縮小しても位置がずれず、サムネイルでも同じ絵になる。
--
-- annotations の形（JSON配列）:
--   { id, type:'pen'|'marker', color, width, points:[x,y,x,y,...] }
--   { id, type:'text', color, x, y, w, text, leader?:{x,y} }
--     leader は引き出し線の先端。テキストの箱から指したい場所まで伸びる。
-- ============================================================

CREATE TABLE IF NOT EXISTS koseki_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  -- 誰の戸籍か。koseki_requests.target_person と同じ「氏名」で紐づける
  -- （戸籍請求の行は転籍で増減するため、行ではなく人に付ける）
  target_person text,
  image_path    text NOT NULL,
  image_bucket  text NOT NULL DEFAULT 'koseki-images',
  file_name     text,
  annotations   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_koseki_images_case ON koseki_images(case_id, target_person, sort_order);

ALTER TABLE koseki_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS koseki_images_all ON koseki_images;
CREATE POLICY koseki_images_all ON koseki_images FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 画像の保存バケット（非公開）。meeting-memos と同じ運用。
INSERT INTO storage.buckets (id, name, public)
VALUES ('koseki-images', 'koseki-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS koseki_images_objects_all ON storage.objects;
CREATE POLICY koseki_images_objects_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'koseki-images') WITH CHECK (bucket_id = 'koseki-images');

NOTIFY pgrst, 'reload schema';
