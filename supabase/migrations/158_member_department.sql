-- ============================================================
-- 158_member_department.sql
-- members に「所属事業部」カラムを追加。
--   例: 相続事業部 / LP事業部 / 相続・生保 / コンサル・経営企画 / 信託保証事業部 / 法人営業部 / 総務・経理
-- チーム(team_id)より上位の組織区分。一覧・ダッシュボードの部門集計や絞り込みに使う。
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS department TEXT;

COMMENT ON COLUMN members.department IS '所属事業部（相続事業部 / LP事業部 等。team より上位の組織区分）';
