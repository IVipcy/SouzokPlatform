-- 相続人が存命か死亡かのフラグ。
--
-- 数次相続・代襲相続の判断は「その相続人が亡くなっているか」から始まるが、
-- 相続人一覧にはその区別を持つ場所が無く、備考に書くしかなかった。
-- 一覧でそのままチェックでき、相続関係図にも「故」として出す。

ALTER TABLE heirs
  ADD COLUMN IF NOT EXISTS is_deceased boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN heirs.is_deceased IS '死亡している相続人（数次相続・代襲の判断に使う。相関図で「故」表示）';
