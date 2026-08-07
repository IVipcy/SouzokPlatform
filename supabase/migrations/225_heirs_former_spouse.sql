-- ============================================================
-- 225_heirs_former_spouse.sql
-- 前妻・前夫と、異母／異父の子（異母きょうだい）を相関図に描けるようにする。
--
-- 考え方：
--   ・前妻／前夫そのものは相続人ではないが、相関図には必ず描く必要がある
--     （その人との子が第1順位の相続人になるため、線の出どころが要る）。
--     続柄に「前妻」「前夫」を足し、heirs の行として持つ。is_legal_heir は false のまま。
--   ・子については「誰との子か」だけ持てば足りる。other_parent_heir_id が
--     前妻／前夫の行を指していれば、その線からぶら下げて描く。
--     未設定＝現配偶者との子（＝これまでと同じ描画）なので、既存案件に影響しない。
--   ・被相続人自身の異母／異父きょうだい（第3順位・相続分は全血の1/2）は
--     続柄「異母兄弟姉妹」「異父兄弟姉妹」で表し、図には「半血」バッジを出す。
--     こちらは線の分岐まではせず、バッジで注意喚起するに留める。
-- ============================================================

ALTER TABLE heirs ADD COLUMN IF NOT EXISTS other_parent_heir_id uuid REFERENCES heirs(id) ON DELETE SET NULL;

COMMENT ON COLUMN heirs.other_parent_heir_id IS
  '被相続人以外のもう一方の親（前妻・前夫の heirs 行を指す）。未設定なら現配偶者との子として描画する。';

CREATE INDEX IF NOT EXISTS idx_heirs_other_parent ON heirs(other_parent_heir_id);
