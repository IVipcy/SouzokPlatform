-- ============================================================
-- 232_heir_is_client.sql
-- 相続人が「依頼者」かどうかのフラグ。
--
-- これまで依頼者かどうかは case_clients（面談に来た人）の氏名と突き合わせて判定していた。
-- 氏名の表記ゆれ（スペース有無・旧字）で外れることがあり、
-- 「誰の戸籍から手を付けるか」の判断が名寄せ次第でぶれていた。
-- 続柄（長男 等）とは別の軸なので、相続人側に独立したフラグとして持たせる。
--
-- 用途：
--   ・タスク一括生成で、最初に出す戸籍タスク＝依頼者の分 を決める
--   ・戸籍タスク名の肩書き表示（◯◯・依頼者）
--   ・相続人一覧・相関図での識別
-- ============================================================

ALTER TABLE heirs ADD COLUMN IF NOT EXISTS is_client boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN heirs.is_client IS
  '依頼者（この案件を依頼した相続人）かどうか。続柄とは別軸のフラグ。';

-- 既存データの移行：氏名（空白を除いて比較）が case_clients と一致する相続人にフラグを立てる。
UPDATE heirs h
   SET is_client = true
  FROM case_clients cc
 WHERE cc.case_id = h.case_id
   AND replace(replace(coalesce(cc.name, ''), ' ', ''), '　', '') <> ''
   AND replace(replace(coalesce(cc.name, ''), ' ', ''), '　', '')
     = replace(replace(coalesce(h.name, ''), ' ', ''), '　', '')
   AND h.is_client = false;

CREATE INDEX IF NOT EXISTS idx_heirs_is_client ON heirs(case_id) WHERE is_client;

NOTIFY pgrst, 'reload schema';
