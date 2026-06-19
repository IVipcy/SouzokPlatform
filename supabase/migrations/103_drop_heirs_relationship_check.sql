-- 相続人の続柄(relationship_type)を法定相続人・代襲まで網羅した選択肢に拡張したため、
-- 旧来のCHECK制約（配偶者/子/父/母/その他のみ）を撤去する。
-- これが無いと「長男」「兄」「孫」等で相続人追加が制約違反でエラーになる。

ALTER TABLE heirs DROP CONSTRAINT IF EXISTS heirs_relationship_type_check;
