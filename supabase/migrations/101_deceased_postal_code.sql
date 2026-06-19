-- 住所入力を「郵便番号＋住所」に統一するため、被相続人にも郵便番号欄を追加。
-- （依頼者は clients.postal_code で既に分離済み。封筒生成で桁ごとに配置するため別フィールドが扱いやすい）

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS deceased_postal_code TEXT;

COMMENT ON COLUMN cases.deceased_postal_code IS '被相続人 郵便番号';
