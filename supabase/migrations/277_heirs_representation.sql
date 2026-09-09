-- 相続人：代襲の親の紐づけと氏名不明（2026-09-09）
--
-- parent_heir_id            … 代襲相続人（孫・ひ孫・甥・姪）の親＝この案件の相続人の行（死亡した子／兄弟姉妹）
-- parent_relationship_type  … 親が行として登録されていないときの、親の続柄（兄／姉／弟／妹／長男…）
-- name_unknown              … 続柄は分かっているが氏名が不明。name には「姪（氏名不明）」のような仮の名前が入る
--
-- 相関図は parent_heir_id（無ければ parent_relationship_type）で甥・姪を親の下に描き、
-- 法定相続分は親の取り分をその子で分ける（代襲）。死亡している人は順位の判定から外す。

ALTER TABLE heirs
  ADD COLUMN IF NOT EXISTS parent_heir_id uuid REFERENCES heirs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_relationship_type text,
  ADD COLUMN IF NOT EXISTS name_unknown boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN heirs.parent_heir_id IS '代襲相続人の親（この案件の heirs.id）';
COMMENT ON COLUMN heirs.parent_relationship_type IS '親が未登録のときの親の続柄（兄／姉／弟／妹／長男 等）';
COMMENT ON COLUMN heirs.name_unknown IS '氏名不明（name は続柄からの仮名）';

-- 確認：
-- SELECT name, relationship_type, is_deceased, parent_heir_id, parent_relationship_type, name_unknown FROM heirs ORDER BY case_id, sort_order;
