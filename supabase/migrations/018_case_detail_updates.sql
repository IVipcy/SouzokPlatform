-- 案件詳細画面 大規模更新 (2026-04-16)

-- 面談場所
ALTER TABLE cases ADD COLUMN IF NOT EXISTS meeting_place TEXT;

-- 受注ルート詳細（詳細受注ルート）
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_route_detail TEXT;

-- 紹介タブ: 弁護士紹介
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lawyer_name TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lawyer_office TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lawyer_referral_fee INTEGER;

-- 紹介タブ: 遺品整理
ALTER TABLE cases ADD COLUMN IF NOT EXISTS estate_clearance_company TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS estate_clearance_fee INTEGER;

-- 依頼者に郵便番号（まだ無い場合のみ）
ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code TEXT;
