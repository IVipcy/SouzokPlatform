-- ============================================================
-- 090_order_category.sql
-- 受注区分（単一）を案件に保持。手続き一式/登記/遺言/信託/放棄/調停/検認/後見/契約書/執行。
-- 役割分担（業務・作業・担当）は既存の intake_roles(JSONB) を流用（案あ）。
-- ============================================================
-- ※ order_category(配列・旧) と衝突するため service_category(単一) を使う。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS service_category TEXT;
