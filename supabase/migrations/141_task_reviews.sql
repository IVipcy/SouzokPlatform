-- ============================================================
-- 141_task_reviews.sql
-- 前段作業の確認（不備なし/不備あり）の評価を、前段作業の実施者に紐づけて蓄積する。
-- 目的: 事務管理担当ごとの「苦手な作業（不備が多い作業）」を後日マイページで可視化するため。
--   reviewed_member_id = 前段作業をやった人（＝評価対象）
--   reviewer_member_id = 評価した人（このタスクの担当）
-- ============================================================

CREATE TABLE IF NOT EXISTS task_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  reviewed_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,   -- 前段タスク
  reviewer_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,           -- 評価したタスク（このタスク）
  reviewed_member_id UUID REFERENCES members(id) ON DELETE SET NULL,       -- 前段の作業者（評価対象）
  reviewer_member_id UUID REFERENCES members(id) ON DELETE SET NULL,       -- 評価した人
  result TEXT NOT NULL,            -- '不備なし' | '不備あり'
  defect_detail TEXT,              -- 不備内容（不備ありのみ）
  gyomu TEXT,                      -- 前段タスクの業務区分（集計用）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1つのタスクから同じ前段タスクへの評価は1件（再評価は上書き）。
CREATE UNIQUE INDEX IF NOT EXISTS task_reviews_pair_uniq ON task_reviews(reviewer_task_id, reviewed_task_id);
-- 集計用（担当者ごとの作業別不備率）。
CREATE INDEX IF NOT EXISTS idx_task_reviews_member ON task_reviews(reviewed_member_id, gyomu);

ALTER TABLE task_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_reviews_all ON task_reviews;
CREATE POLICY task_reviews_all ON task_reviews
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
