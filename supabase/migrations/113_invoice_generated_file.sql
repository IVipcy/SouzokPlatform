-- 請求書の公式フォーマット(Excelテンプレ)の保存パスを invoices に持たせる。
-- メイン請求一覧の「プレビュー」を、古いHTMLプレビューではなく公式Excelのダウンロードに切り替えるため。
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS generated_file_path TEXT;  -- documents バケット内の Excel パス

COMMENT ON COLUMN invoices.generated_file_path IS '生成済みの公式請求書Excel（documentsバケットのパス）';
