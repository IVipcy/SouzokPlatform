-- 既存の heirs.relationship に残る旧選択肢（父母/兄弟姉妹/代襲相続人）を
-- relationship_type の新設計に合わせて整理する。
--
-- 方針:
--   '父母'         → relationship_type = 'その他'（父/母どちらか不明なため）、relationship は温存
--   '兄弟姉妹'     → relationship_type = 'その他'
--   '代襲相続人'   → relationship_type = 'その他'
-- relationship フリーテキストは表示用として温存。

UPDATE heirs SET relationship_type = 'その他'
  WHERE relationship_type IS NULL
    AND relationship IN ('父母', '兄弟姉妹', '代襲相続人', '代襲');
