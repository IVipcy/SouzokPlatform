-- ============================================================
-- 087_generate_system_tasks_on_insert.sql
-- 新規案件を「検討中 / 検討中（契約書待ち）/ 受注」で直接 INSERT した場合も、
-- 初期システムタスク（検討状況の確認・オーダーシート 等）を生成する。
--   従来は AFTER UPDATE OF status のみで、登録フォームから直接その状態で
--   作成した案件にはタスクが生成されていなかった。
-- 既存関数 generate_system_tasks_on_status_change() をそのまま流用（INSERT時 OLD=NULL
-- のため status の DISTINCT 判定を通過し生成される）。create_system_task の重複ガードで
-- 後続の UPDATE と二重生成しない。
-- ============================================================

DROP TRIGGER IF EXISTS cases_generate_system_tasks_insert ON cases;
CREATE TRIGGER cases_generate_system_tasks_insert
AFTER INSERT ON cases
FOR EACH ROW EXECUTE FUNCTION generate_system_tasks_on_status_change();
