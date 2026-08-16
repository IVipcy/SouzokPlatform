-- 取引明細の取得期間（口座ごと・複数本）。
--
-- 取引明細は「相続開始日まで」の1本で済むとは限らず、
-- 使途不明金の確認などで別の年度を追加で請求することがある。
-- 開始日と終了日の組を何本でも持てるようにする。
--   [{ "start": "2023-04-01", "end": "2024-03-31" }, ...]
--
-- 既存の transaction_history_period（「過去3年分」等のフリー文字・口座の新規作成フォーム）は
-- 別項目としてそのまま残す。

ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS transaction_periods jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN financial_assets.transaction_periods IS '取引明細の取得期間（{start,end} の配列。取引明細=要 のときに使う）';
