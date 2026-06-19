-- 相続登記タブの再設計: 物件ごとに「相続登記の種別（複数）・登記原因・管轄法務局・
-- ステータス・申請日・完了日・備考」を管理する。取得進捗（請求/到着）は財産調査タブ側で管理。

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS registration_types TEXT[],        -- 相続登記の種別（複数選択）
  ADD COLUMN IF NOT EXISTS registration_cause TEXT,          -- 登記原因（法定相続分/遺産分割協議/遺言/遺贈）
  ADD COLUMN IF NOT EXISTS registration_office TEXT,         -- 管轄法務局
  ADD COLUMN IF NOT EXISTS registration_status TEXT,         -- ステータス
  ADD COLUMN IF NOT EXISTS registration_apply_date DATE,     -- 申請日
  ADD COLUMN IF NOT EXISTS registration_complete_date DATE,  -- 完了日
  ADD COLUMN IF NOT EXISTS registration_notes TEXT;          -- 備考

COMMENT ON COLUMN real_estate_properties.registration_types IS '相続登記の種別（複数選択）';
COMMENT ON COLUMN real_estate_properties.registration_status IS '相続登記ステータス';
