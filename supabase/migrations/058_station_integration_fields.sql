-- ============================================================
-- 058_station_integration_fields.sql
-- 相続ステーション連携①（面談設定済案件取込）で受信する項目を
-- 案件詳細画面で扱えるようにカラム追加。
--
-- 関連: docs/相続ステーション連携_項目マッピング表.xlsx
--
-- 追加カラム:
--   - deceased_age       : 被相続人年齢（生年月日とは別。連携時は年齢で来る）
--   - visit_address      : 伺い先住所（訪問面談時の訪問先）
--   - visit_notes        : 伺い先補足（目印・駐車場・呼び鈴位置等）
--   - hearing_content    : ヒアリング内容（LP担当の電話ヒアリング、行政書士共有）
--   - special_notes      : 特記事項（オーシャン社内のみ参照）
--   - other_needs        : その他ニーズ（案内リクエスト等）
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS deceased_age INTEGER;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS visit_address TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS visit_notes TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS hearing_content TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS special_notes TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS other_needs TEXT;

COMMENT ON COLUMN cases.deceased_age IS '被相続人年齢（ステーション連携で受信）。生年月日が判明したら deceased_birth_date を更新';
COMMENT ON COLUMN cases.visit_address IS '伺い先住所（訪問面談時の訪問先）';
COMMENT ON COLUMN cases.visit_notes IS '伺い先補足（目印、駐車場、呼び鈴位置等）';
COMMENT ON COLUMN cases.hearing_content IS 'LP担当ヒアリング内容（行政書士間で共有）';
COMMENT ON COLUMN cases.special_notes IS '特記事項（オーシャン社内のみ参照、パートナー報告対象外）';
COMMENT ON COLUMN cases.other_needs IS 'その他ニーズ（案内リクエスト等、日付プレフィックス付き複数行）';
