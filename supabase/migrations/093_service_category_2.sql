-- ============================================================
-- 093_service_category_2.sql
-- 受注区分の2つ目（②）。検認①→手続き一式② のコンボのみ使用。
-- service_category(①) と合わせて順番つきの複数受注区分を表現する。
-- ============================================================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS service_category_2 TEXT;
