-- 不満・クレームの記録（案件報告タブ内サブタブ「不満・クレーム」で管理）。
-- 依頼者連絡(client_communications)とは別テーブル。受注担当への報告用。
-- severity ∈ {クレーム, 大クレーム} の行が1件でもあれば cases.has_complaint=true を自動セット（トリガー）。
CREATE TABLE IF NOT EXISTS case_complaints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  occurred_at     date NOT NULL DEFAULT CURRENT_DATE,               -- 日付
  severity        text NOT NULL CHECK (severity IN ('少し不満','不満','クレーム','大クレーム')),
  contact_method  text CHECK (contact_method IN ('電話','LINE','メール','手紙')),
  detail          text,                                              -- やり取り詳細
  action          text CHECK (action IN ('謝罪・即対応（完結）','謝罪・受注相談')),
  created_by      uuid REFERENCES members(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_complaints_case_id ON case_complaints(case_id);
CREATE INDEX IF NOT EXISTS idx_case_complaints_severity ON case_complaints(severity);

-- cases.has_complaint の自動同期：severity∈{クレーム,大クレーム}の存在で true/false を切り替え。
-- INSERT/UPDATE/DELETE すべてで再計算（該当案件の残行を数え直す）。
CREATE OR REPLACE FUNCTION sync_case_has_complaint() RETURNS trigger AS $$
DECLARE
  target_case uuid;
  has_any boolean;
BEGIN
  target_case := COALESCE(NEW.case_id, OLD.case_id);
  SELECT EXISTS(
    SELECT 1 FROM case_complaints
    WHERE case_id = target_case AND severity IN ('クレーム','大クレーム')
  ) INTO has_any;
  -- 既存の client_communications='クレーム対応' からのフラグも尊重（OR）
  IF NOT has_any THEN
    SELECT EXISTS(
      SELECT 1 FROM client_communications
      WHERE case_id = target_case AND communication_type = 'クレーム対応'
    ) INTO has_any;
  END IF;
  UPDATE cases SET has_complaint = has_any WHERE id = target_case;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_complaints_sync ON case_complaints;
CREATE TRIGGER trg_case_complaints_sync
AFTER INSERT OR UPDATE OR DELETE ON case_complaints
FOR EACH ROW EXECUTE FUNCTION sync_case_has_complaint();
