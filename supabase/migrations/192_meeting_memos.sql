-- ============================================================
-- 192_meeting_memos.sql
-- 面談シート（統合アプリ /intake の①タブ）の手書きメモ。
-- 案件に紐づけ、手書き画像は Storage(meeting-memos バケット) に保存しパスを持つ。
-- OCR/手入力のテキストも保持し、②面談結果登録・③オーダーシートへ引き継ぐ材料にする。
-- （旧 /meeting-sheet 仮版は localStorage 保存だったのを DB 化）
-- ============================================================

CREATE TABLE IF NOT EXISTS meeting_memos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  section      text,                                    -- 面談シートのどのセクションのメモか（任意・client/heirs/order/assets 等）
  image_path   text,                                    -- Storage のパス（meeting-memos バケット）
  image_bucket text NOT NULL DEFAULT 'meeting-memos',
  ocr_text     text,                                    -- 手書きをAIでテキスト化した結果（任意）
  sort_order   integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_memos_case ON meeting_memos(case_id, section, sort_order);

ALTER TABLE meeting_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_memos_all ON meeting_memos;
CREATE POLICY meeting_memos_all ON meeting_memos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 手書き画像の保存バケット（非公開）。既存の documents バケットと同じ運用。
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-memos', 'meeting-memos', false)
ON CONFLICT (id) DO NOTHING;

-- 認証ユーザーは meeting-memos バケットの読み書きを許可（既存バケットと同等の運用）。
DROP POLICY IF EXISTS meeting_memos_objects_all ON storage.objects;
CREATE POLICY meeting_memos_objects_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'meeting-memos') WITH CHECK (bucket_id = 'meeting-memos');

-- PostgREST schema cache をリロード
NOTIFY pgrst, 'reload schema';
