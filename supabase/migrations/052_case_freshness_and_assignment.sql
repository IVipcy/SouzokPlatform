-- ============================================================
-- 052_case_freshness_and_assignment.sql
-- 案件の「鮮度フラグ」と「担当アサインの追跡」基盤
--
--  A. cases.last_opened_at : 案件詳細を最後に開いた日時。
--     → フラグ(赤/黄/青)を「最終接触からの経過日数」で判定するのに使う。
--  B. case_members.assigned_at / updated_at と、担当変更の activity_log 記録。
--     → 新規受注の担当アサイン期限アラート・NEWマーク(青/赤=担当変更)の判定に使う。
-- ============================================================

-- A) 案件を最後に開いた日時
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_cases_last_opened ON cases(last_opened_at);

-- B) 担当割当のタイムスタンプ
ALTER TABLE case_members ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE case_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 既存行の assigned_at を埋める（NULLの場合）
UPDATE case_members SET assigned_at = now() WHERE assigned_at IS NULL;

-- updated_at トリガー
DROP TRIGGER IF EXISTS case_members_updated_at ON case_members;
CREATE TRIGGER case_members_updated_at
  BEFORE UPDATE ON case_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 担当の追加・削除・ロール変更を activity_log に記録（担当者変更=赤NEWの判定に使う）
CREATE OR REPLACE FUNCTION log_case_member_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO activity_log (entity_type, entity_id, action, new_value, metadata)
    VALUES ('case', NEW.case_id, 'assignee_change', NEW.role,
            jsonb_build_object('op', 'add', 'member_id', NEW.member_id, 'role', NEW.role));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO activity_log (entity_type, entity_id, action, old_value, metadata)
    VALUES ('case', OLD.case_id, 'assignee_change', OLD.role,
            jsonb_build_object('op', 'remove', 'member_id', OLD.member_id, 'role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_members_log_change ON case_members;
CREATE TRIGGER case_members_log_change
  AFTER INSERT OR DELETE ON case_members
  FOR EACH ROW EXECUTE FUNCTION log_case_member_change();
