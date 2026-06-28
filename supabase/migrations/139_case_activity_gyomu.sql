-- ============================================================
-- 139_case_activity_gyomu.sql
-- 進捗メモ（case_activities の activity_type='note'）に業務区分を持たせる。
--   フィルタ・表示・手動追加時の選択に使う。タスク紐づきメモはタスクの業務区分(phase)から補完表示。
-- ============================================================

ALTER TABLE case_activities ADD COLUMN IF NOT EXISTS gyomu TEXT;
