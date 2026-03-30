-- ============================================================
-- RLS (Row Level Security) ポリシー設定
-- 認証済みユーザーのみアクセス可能にする
-- ============================================================

-- ========================
-- 1. RLS を有効化
-- ========================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- ========================
-- 2. マスタテーブル（全認証ユーザーが読み取り可能）
-- ========================

-- members: 認証済みユーザーは全メンバーを参照可能
CREATE POLICY "members_select" ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "members_insert" ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "members_update" ON members FOR UPDATE TO authenticated USING (true);

-- roles: 読み取り専用
CREATE POLICY "roles_select" ON roles FOR SELECT TO authenticated USING (true);

-- member_roles: 読み取り可能、更新は認証ユーザー
CREATE POLICY "member_roles_select" ON member_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "member_roles_all" ON member_roles FOR ALL TO authenticated USING (true);

-- role_permissions: 読み取り専用
CREATE POLICY "role_permissions_select" ON role_permissions FOR SELECT TO authenticated USING (true);

-- phases, status_definitions, status_transitions: 読み取り専用
CREATE POLICY "phases_select" ON phases FOR SELECT TO authenticated USING (true);
CREATE POLICY "status_definitions_select" ON status_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "status_transitions_select" ON status_transitions FOR SELECT TO authenticated USING (true);

-- task_templates: 読み取り専用
CREATE POLICY "task_templates_select" ON task_templates FOR SELECT TO authenticated USING (true);

-- partners, referral_destinations: 全認証ユーザー
CREATE POLICY "partners_all" ON partners FOR ALL TO authenticated USING (true);
CREATE POLICY "referral_destinations_all" ON referral_destinations FOR ALL TO authenticated USING (true);

-- ========================
-- 3. トランザクションテーブル（認証済みユーザーがCRUD可能）
-- ========================

-- clients
CREATE POLICY "clients_all" ON clients FOR ALL TO authenticated USING (true);

-- cases
CREATE POLICY "cases_select" ON cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "cases_insert" ON cases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cases_update" ON cases FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cases_delete" ON cases FOR DELETE TO authenticated USING (true);

-- case_members
CREATE POLICY "case_members_all" ON case_members FOR ALL TO authenticated USING (true);

-- tasks
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated USING (true);

-- task_assignees
CREATE POLICY "task_assignees_all" ON task_assignees FOR ALL TO authenticated USING (true);

-- task_comments
CREATE POLICY "task_comments_all" ON task_comments FOR ALL TO authenticated USING (true);

-- documents
CREATE POLICY "documents_select" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_insert" ON documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "documents_update" ON documents FOR UPDATE TO authenticated USING (true);
CREATE POLICY "documents_delete" ON documents FOR DELETE TO authenticated USING (true);

-- activity_log: 挿入と参照
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- invoices
CREATE POLICY "invoices_all" ON invoices FOR ALL TO authenticated USING (true);

-- payments
CREATE POLICY "payments_all" ON payments FOR ALL TO authenticated USING (true);

-- events
CREATE POLICY "events_all" ON events FOR ALL TO authenticated USING (true);

-- ========================
-- 4. Storage バケット（ドキュメント用）
-- ========================
-- Note: Storage RLS は Supabase ダッシュボードで設定するか、
-- 以下のSQLで実行してください:
--
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
--
-- CREATE POLICY "documents_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
-- CREATE POLICY "documents_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
-- CREATE POLICY "documents_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents');
