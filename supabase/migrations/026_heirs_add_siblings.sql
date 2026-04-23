-- 兄弟姉妹パターン対応: CHECK 制約を拡張
ALTER TABLE heirs DROP CONSTRAINT IF EXISTS heirs_relationship_type_check;
ALTER TABLE heirs ADD CONSTRAINT heirs_relationship_type_check
  CHECK (relationship_type IN ('配偶者','子','父','母','兄弟姉妹','その他'));

-- 既存の relationship='兄弟姉妹' を relationship_type にも反映
UPDATE heirs SET relationship_type = '兄弟姉妹'
  WHERE relationship = '兄弟姉妹' AND relationship_type = 'その他';
