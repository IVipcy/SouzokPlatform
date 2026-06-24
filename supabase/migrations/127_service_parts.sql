-- 受注区分パート制：受注区分を「順序付きパート（status付き）」で保持する。
-- 先行(検認・後見・執行・調停)→本体(手続き一式)の順に進行。差し替え/再開も表現する。
-- NULL/空 の場合は旧データとして service_category / service_category_2 から導出する（lib/serviceParts.ts）。
-- 形式: [{ "key": "検認", "order": 1, "status": "進行中" }, { "key": "手続き一式", "order": 2, "status": "未着手" }]
--   status: 未着手 / 進行中 / 完了 / 中止
ALTER TABLE cases ADD COLUMN IF NOT EXISTS service_parts jsonb;

COMMENT ON COLUMN cases.service_parts IS '受注区分のパート（順序付き＋status[未着手/進行中/完了/中止]）。NULL=旧データ（service_category/_2から導出）。';
