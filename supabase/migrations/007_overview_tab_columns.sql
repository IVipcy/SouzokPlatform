-- ============================================================
-- 概要タブ充実化のための追加カラム
-- ============================================================

-- === 基本情報セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS location TEXT;           -- 拠点
ALTER TABLE cases ADD COLUMN IF NOT EXISTS team TEXT;               -- チーム
ALTER TABLE cases ADD COLUMN IF NOT EXISTS probability INT;         -- 確度（%）
ALTER TABLE cases ADD COLUMN IF NOT EXISTS meeting_date DATE;       -- 面談予定日
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_received_date DATE;-- 受注日
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lost_reason TEXT;        -- 失注の理由

-- === 受注内容セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS other_procedure TEXT;    -- その他手続
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_category TEXT[];   -- 受注区分（複数選択）

-- === 戸籍請求関連セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS koseki_request_reason TEXT;       -- 戸籍請求理由
ALTER TABLE cases ADD COLUMN IF NOT EXISTS koseki_request_reason_other TEXT; -- 戸籍請求理由（その他）
ALTER TABLE cases ADD COLUMN IF NOT EXISTS koseki_request_pattern TEXT;      -- 戸籍請求書パターン
ALTER TABLE cases ADD COLUMN IF NOT EXISTS koseki_request_type TEXT[];       -- 請求の種別（複数選択）
ALTER TABLE cases ADD COLUMN IF NOT EXISTS koseki_purpose TEXT;              -- 使用目的
ALTER TABLE cases ADD COLUMN IF NOT EXISTS koseki_notes TEXT;                -- 戸籍特記事項

-- === 受注ルート・紹介セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_route TEXT;          -- 受注ルート
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_route_lp_name TEXT;  -- 受注ルート（LP名）
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_route_person TEXT;   -- 受注ルート担当者
ALTER TABLE cases ADD COLUMN IF NOT EXISTS referral_name TEXT;        -- 紹介先

-- === 郵送・書類管理セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS mailing_destination TEXT;      -- 顧客郵送先
ALTER TABLE cases ADD COLUMN IF NOT EXISTS mailing_address_other TEXT;    -- 郵送先住所（その他）
ALTER TABLE cases ADD COLUMN IF NOT EXISTS investigation_document TEXT;   -- 財産調査使用書類

-- === 相続税申告セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS tax_advisor_referral TEXT;   -- 税理士紹介有無
ALTER TABLE cases ADD COLUMN IF NOT EXISTS tax_advisor_name TEXT;       -- 税理士名・事務所名

-- === 遺言関連セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_remainders_risk BOOLEAN DEFAULT false; -- 遺留分リスク
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_bequest BOOLEAN DEFAULT false;         -- 遺贈有無
ALTER TABLE cases ADD COLUMN IF NOT EXISTS will_creation_place TEXT;                   -- 作成場所
ALTER TABLE cases ADD COLUMN IF NOT EXISTS notary_office_name TEXT;                    -- 公証役場名

-- === 信託関連セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS trust_contract_type TEXT;  -- 信託契約書種別

-- === 生命保険提案セクション ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS life_insurance_proposal TEXT;         -- 生命保険提案有無
ALTER TABLE cases ADD COLUMN IF NOT EXISTS life_insurance_company TEXT;          -- 保険会社名
ALTER TABLE cases ADD COLUMN IF NOT EXISTS life_insurance_type_amount TEXT;      -- 保険種類・金額
ALTER TABLE cases ADD COLUMN IF NOT EXISTS life_insurance_inquiry BOOLEAN DEFAULT false; -- 生命保険協会照会
ALTER TABLE cases ADD COLUMN IF NOT EXISTS life_insurance_inquiry_notes TEXT;    -- 照会結果備考

-- === 依頼者テーブルへの追加カラム ===
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mobile_phone TEXT;          -- 携帯TEL
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_contact TEXT[];   -- 連絡先希望
ALTER TABLE clients ADD COLUMN IF NOT EXISTS customer_no TEXT;           -- 顧客NO
ALTER TABLE clients ADD COLUMN IF NOT EXISTS has_special_chars BOOLEAN DEFAULT false; -- 外字有無

-- === 被相続人追加 ===
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deceased_has_special_chars BOOLEAN DEFAULT false; -- 被相続人外字有無
