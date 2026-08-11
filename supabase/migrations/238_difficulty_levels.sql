-- ============================================================
-- 238_difficulty_levels.sql
-- 難易度の値を画面（普通 / 難 / 激難）に合わせる。
--
-- 001 で入れた CHECK が ('易','普','難') のままで、画面は migration 195 の時点から
-- 普通/難/激難 の3段階になっていた。そのためオーダーシートで難易度を選ぶと
-- cases_difficulty_check に引っかかって保存できなかった。
--
-- 既存データは 易・普 → 普通 に寄せる（易と普の区別は運用で使っていない）。
-- ============================================================

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_difficulty_check;

UPDATE cases SET difficulty = '普通' WHERE difficulty IN ('易', '普');

ALTER TABLE cases
  ADD CONSTRAINT cases_difficulty_check CHECK (difficulty IS NULL OR difficulty IN ('普通', '難', '激難'));

NOTIFY pgrst, 'reload schema';
