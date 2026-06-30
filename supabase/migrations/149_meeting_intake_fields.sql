-- ============================================================
-- 149_meeting_intake_fields.sql
-- 新規面談登録の簡素化に伴う項目。
--   meeting_owner_id : 面談担当（＝受注担当。登録/面談情報を更新し始めたアカウントを自動設定）
--   meeting_type     : 面談内容（フリーテキスト。既定「新規面談」）
--   proposal_note    : 提案金額（フリーテキスト。例「提案せず」）
--   is_lp_direct     : LP直案件フラグ（相続ステーション連携案件は自動でtrue。画面非表示・裏持ち）
-- ※ 関係性(relationship_to_deceased)・伺い先・ヒアリング等は既存カラムを使用。
-- ============================================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS meeting_owner_id uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meeting_type text,
  ADD COLUMN IF NOT EXISTS proposal_note text,
  ADD COLUMN IF NOT EXISTS is_lp_direct boolean NOT NULL DEFAULT false;
