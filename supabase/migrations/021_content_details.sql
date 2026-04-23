-- 021: 遺言文案・信託文案の「記載内容」をカテゴリ別自由記述で管理
-- Excelオーダーシート「遺言文案」「信託文案」シートの記載内容欄を忠実に反映
-- 構造: { "不動産": "...", "預貯金": "...", ... }

ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_content_details JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS trust_content_details JSONB;

COMMENT ON COLUMN cases.will_content_details IS '遺言文案 カテゴリ別自由記述 (例: {"不動産": "〇〇を長男△△に相続させる", ...})';
COMMENT ON COLUMN cases.trust_content_details IS '信託文案 カテゴリ別自由記述 (例: {"不動産": "〇〇を信託財産とする", ...})';
