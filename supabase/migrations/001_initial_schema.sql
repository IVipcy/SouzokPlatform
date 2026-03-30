-- ============================================================
-- 相続プラットフォーム 初期スキーマ
-- ============================================================

-- =========================
-- 1. マスタテーブル
-- =========================

-- メンバー（社員）
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  avatar_color TEXT DEFAULT '#6B7280',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ロール定義
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0
);

-- メンバー×ロール紐付け
CREATE TABLE member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(member_id, role_id)
);

-- 権限マトリクス
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  allowed BOOLEAN DEFAULT false,
  UNIQUE(role_id, permission)
);

-- フェーズ定義
CREATE TABLE phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  sort_order INT DEFAULT 0
);

-- ステータス定義（案件・タスク共通）
CREATE TABLE status_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('case', 'task')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  sort_order INT DEFAULT 0,
  UNIQUE(type, key)
);

-- ステータス遷移ルール
CREATE TABLE status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('case', 'task')),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  allowed_roles TEXT[],
  requires_comment BOOLEAN DEFAULT false,
  UNIQUE(type, from_status, to_status)
);

-- タスクテンプレート
CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  phase TEXT NOT NULL,
  category TEXT NOT NULL,
  procedure_text TEXT,
  default_role TEXT,
  is_manual BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- パートナー企業マスタ（案件を斡旋してくれる企業）
CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  kickback_rate DECIMAL(5,2) NOT NULL DEFAULT 0,  -- 還元率（%）例: 10.00 = 10%
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 紹介先企業マスタ（こちらから案件を斡旋する先）
CREATE TABLE referral_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  specialty TEXT,              -- 得意分野（不動産売却、税理士、弁護士等）
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================
-- 2. トランザクションテーブル
-- =========================

-- 顧客（依頼人）
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  furigana TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  postal_code TEXT,
  relationship_to_deceased TEXT,  -- 被相続人との続柄
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 案件
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL,       -- 'R7-A00127'
  deal_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '架電案件化',
  client_id UUID REFERENCES clients(id),
  deceased_name TEXT,
  date_of_death DATE,
  order_date DATE,
  completion_date DATE,
  difficulty TEXT CHECK (difficulty IN ('易', '普', '難')),
  procedure_type TEXT[],                  -- {'手続一式','登記'}
  additional_services TEXT[],             -- {'相続税申告','不動産売却'}
  tax_filing_required TEXT DEFAULT '確認中' CHECK (tax_filing_required IN ('要', '不要', '確認中')),
  tax_filing_deadline DATE,
  property_rank TEXT CHECK (property_rank IN ('S', 'A', 'B', 'C', '確認中')),
  total_asset_estimate BIGINT,
  partner_id UUID REFERENCES partners(id),                    -- 斡旋元パートナー
  referral_destination_id UUID REFERENCES referral_destinations(id),  -- 紹介先
  referral_fee BIGINT,                    -- 紹介料（実額）
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 案件×チームメンバー
CREATE TABLE case_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id),
  role TEXT NOT NULL CHECK (role IN ('sales', 'manager', 'assistant', 'lp', 'accounting')),
  UNIQUE(case_id, member_id, role)
);

-- タスク
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  template_key TEXT,
  title TEXT NOT NULL,
  phase TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT '未着手',
  priority TEXT NOT NULL DEFAULT '通常' CHECK (priority IN ('通常', '急ぎ', '外出タスク')),
  due_date DATE,
  procedure_text TEXT,
  wcheck_by UUID REFERENCES members(id),
  wcheck_at TIMESTAMPTZ,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- タスク×担当者（複数人対応）
CREATE TABLE task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id),
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'sub')),
  UNIQUE(task_id, member_id)
);

-- タスクコメント・差戻し理由
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES members(id),
  content TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'comment' CHECK (comment_type IN ('comment', 'rejection', 'wcheck_pass')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 書類データ
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id),
  name TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT,
  generated_by TEXT,            -- 'ai' or 'manual'
  status TEXT DEFAULT '下書き',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 操作ログ
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,     -- 'case', 'task', 'document'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,          -- 'status_change', 'assign', 'create', etc.
  actor_id UUID REFERENCES members(id),
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================
-- 3. インデックス
-- =========================
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_partner ON cases(partner_id);
CREATE INDEX idx_tasks_case ON tasks(case_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_phase ON tasks(phase);
CREATE INDEX idx_task_assignees_member ON task_assignees(member_id);
CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_case_members_case ON case_members(case_id);
CREATE INDEX idx_case_members_member ON case_members(member_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_actor ON activity_log(actor_id);
CREATE INDEX idx_documents_case ON documents(case_id);

-- =========================
-- 4. updated_at 自動更新トリガー
-- =========================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
