-- 返金の3段階承認フロー：管理担当が申請 → ①受注担当(1次)承認 → ②上長(2次/最終)承認 → 経理が返金実行
-- payment_check_requests(kind='refund') に承認関連カラムを追加。旧: 承認なしで直接返金 → 新: 承認完了しないと返金不可。
ALTER TABLE payment_check_requests
  ADD COLUMN IF NOT EXISTS sales_approver_id     uuid REFERENCES members(id),   -- 1次: 案件の受注担当（申請時に自動セット）
  ADD COLUMN IF NOT EXISTS sales_approved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS sales_reject_note     text,
  ADD COLUMN IF NOT EXISTS leader_approver_id    uuid REFERENCES members(id),   -- 2次: 申請者が同チームから選択
  ADD COLUMN IF NOT EXISTS leader_approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS leader_reject_note    text,
  -- 承認ステータス：pending_sales / pending_leader / approved / rejected（既存 status='完了' で返金済扱い）
  ADD COLUMN IF NOT EXISTS approval_status       text;

CREATE INDEX IF NOT EXISTS idx_pcr_approval_status ON payment_check_requests(approval_status) WHERE approval_status IS NOT NULL;
