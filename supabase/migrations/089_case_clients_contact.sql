-- ============================================================
-- 089_case_clients_contact.sql
-- 依頼者一覧(case_clients)に 携帯TEL / 連絡先希望 / 外字有無 を追加し、
-- 依頼者ごとに表で管理できるようにする（TEL①=phone, TEL②=mobile_phone）。
--   これらは書類生成・請求では使っていない（住所・氏名と違い安全）ため、
--   メイン詳細(clients)から表(case_clients)へ移してよい。
--   メイン依頼者ぶんは clients からバックフィルする。
-- ============================================================

ALTER TABLE case_clients ADD COLUMN IF NOT EXISTS mobile_phone TEXT;
ALTER TABLE case_clients ADD COLUMN IF NOT EXISTS preferred_contact TEXT[];
ALTER TABLE case_clients ADD COLUMN IF NOT EXISTS has_special_chars BOOLEAN NOT NULL DEFAULT false;

-- メイン依頼者へ clients からバックフィル（未設定のみ）
UPDATE case_clients cc
   SET mobile_phone      = c.mobile_phone,
       preferred_contact = c.preferred_contact,
       has_special_chars = COALESCE(c.has_special_chars, false)
  FROM cases ca
  JOIN clients c ON c.id = ca.client_id
 WHERE cc.case_id = ca.id
   AND cc.priority = 'main'
   AND cc.mobile_phone IS NULL
   AND cc.preferred_contact IS NULL
   AND cc.has_special_chars = false;
