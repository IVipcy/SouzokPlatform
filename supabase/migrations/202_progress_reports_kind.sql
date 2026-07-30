-- progress_reports.kind：案件報告を統一フローに拡張。
-- 従来の週次案件報告に加えて、業務完了申請 / 案件再オープン / 納品確認申請 を
-- 同じテーブル・同じUI(案件報告(受信)タブ) で扱う。
--
-- 4種類:
--   progress_check    週次案件報告（既存・デフォルト値）
--   work_complete     業務完了申請（管理→受注承認→status=完了）
--   case_reopen       案件再オープン通知（完了状態から対応中へ戻す・追加業務発生時）
--   delivery_confirm  納品確認申請（管理→受注承認→納品ステータス=納品待ち）

ALTER TABLE progress_reports
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'progress_check'
    CHECK (kind IN ('progress_check', 'work_complete', 'case_reopen', 'delivery_confirm'));

CREATE INDEX IF NOT EXISTS idx_progress_reports_kind ON progress_reports(kind);
