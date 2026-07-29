-- 報連相（報告/連絡/相談）を案件ごとに保持するテーブル。
-- 案件報告(progress_reports)とは別テーブルにする。回答/確認フローは同じテイスト。
-- 通知先は複数（デフォルト=受注担当・追加で同じチームメンバー）。
CREATE TABLE IF NOT EXISTS case_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('報告', '連絡', '相談')),
  requester_id      uuid REFERENCES members(id),
  recipient_ids     uuid[] NOT NULL DEFAULT '{}',  -- 通知先メンバー（複数可）
  message           text,                            -- 本文（必須ではないが実務上は必ず入る）
  requested_date    date NOT NULL DEFAULT CURRENT_DATE,
  status            text NOT NULL DEFAULT '依頼中' CHECK (status IN ('依頼中', '確認済')),
  confirmer_id      uuid REFERENCES members(id),
  confirmed_date    date,
  confirm_comment   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_reports_case_id ON case_reports(case_id);
CREATE INDEX IF NOT EXISTS idx_case_reports_status ON case_reports(status);
