-- 250: 業務運用ルール（読み物）を画面から書けるようにする
--
-- これまで読み物は content/manual/*.md というプログラムのファイルだったため、
-- 画面から編集できず、書き足すたびに開発が要った。
-- マニュアルは「操作方法（どこを押すか）」と「業務運用ルール（なぜそうするか）」の
-- 2本立てにし、後者をこのテーブルで持つ。
--
-- blocks（本文）＝ブロックの並び。ブロックごとにAIで文章を整えられるようにするため、
-- 1本のテキストではなく配列で持つ。
--   [{ id, kind, body, path, caption }]
--     kind = 'heading' | 'text' | 'list' | 'image' | 'warn'
--     body    … heading/text/warn は本文、list は改行区切りの各行
--     path    … image のときだけ。manual-images バケットのパス
--     caption … image のときだけ。図の下に出す短い説明
--
-- 編集できるのはシステム管理者だけ（画面側で出し分け。RLSは既存テーブルと同じ運用）。

CREATE TABLE IF NOT EXISTS manual_articles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 章（アラート / 案件の色 / 請求の型 / 面談 など）。操作方法の章とは別に持つ
  chapter     text NOT NULL DEFAULT '未分類',
  title       text NOT NULL DEFAULT '',
  -- 誰向けの話か（受注担当 / 管理担当 / 事務管理担当 / 経理 / 相続登記チーム）。空＝全員
  roles       text[] NOT NULL DEFAULT '{}',
  -- 検索を助けるキーワード（本文にない言い回しを拾わせる）
  tags        text[] NOT NULL DEFAULT '{}',
  blocks      jsonb  NOT NULL DEFAULT '[]'::jsonb,
  sort_order  integer NOT NULL DEFAULT 0,
  updated_by  uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_articles_order ON manual_articles(chapter, sort_order);

ALTER TABLE manual_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_articles_all ON manual_articles;
CREATE POLICY manual_articles_all ON manual_articles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS manual_articles_updated_at ON manual_articles;
CREATE TRIGGER manual_articles_updated_at
  BEFORE UPDATE ON manual_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 操作方法 → 業務運用ルール へのリンク。手順の行から読み物へ飛ばす。
-- items（操作方法）は jsonb なので列の追加は要らないが、ページ全体に付ける関連ページだけ列で持つ。
--   [{ kind: 'article' | 'url', id?, url?, label }]
ALTER TABLE manual_steps
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN manual_steps.links IS 'このページ全体の関連ページ。[{kind:"article"|"url", id?, url?, label}]';

NOTIFY pgrst, 'reload schema';
