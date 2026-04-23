-- 相続相関図 法務局様式対応
-- relationship_type: 正式な続柄区分（enum的に運用）
-- is_applicant: 法定相続情報一覧図の申出人

ALTER TABLE heirs
  ADD COLUMN IF NOT EXISTS relationship_type TEXT
    CHECK (relationship_type IN ('配偶者','子','父','母','その他')),
  ADD COLUMN IF NOT EXISTS is_applicant BOOLEAN NOT NULL DEFAULT false;

-- 既存データのバックフィル: relationship フリーテキストから推測
UPDATE heirs SET relationship_type = '配偶者'
  WHERE relationship_type IS NULL AND relationship = '配偶者';

UPDATE heirs SET relationship_type = '子'
  WHERE relationship_type IS NULL
    AND relationship IN ('子','長男','長女','二男','二女','三男','三女','四男','四女','養子','長子','次男','次女');

UPDATE heirs SET relationship_type = '父'
  WHERE relationship_type IS NULL AND relationship = '父';

UPDATE heirs SET relationship_type = '母'
  WHERE relationship_type IS NULL AND relationship = '母';

UPDATE heirs SET relationship_type = 'その他'
  WHERE relationship_type IS NULL AND relationship IS NOT NULL;

-- 1案件につき申出人は1名まで（部分インデックスで担保）
CREATE UNIQUE INDEX IF NOT EXISTS idx_heirs_one_applicant_per_case
  ON heirs(case_id) WHERE is_applicant = true;
