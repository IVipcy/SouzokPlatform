-- =========================
-- 請求・入金テーブル
-- =========================

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  invoice_number TEXT,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('前受金', '確定請求')),
  amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '未請求'
    CHECK (status IN ('未請求', '前受金請求済', '前受金入金済', '確定請求済', '入金済', '一部入金')),
  issued_date DATE,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================
-- スケジュール（イベント）テーブル
-- =========================

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('interview', 'task', 'deadline', 'other')),
  event_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  member_id UUID REFERENCES members(id),
  case_id UUID REFERENCES cases(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =========================
-- インデックス
-- =========================
CREATE INDEX idx_invoices_case ON invoices(case_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_member ON events(member_id);
CREATE INDEX idx_events_case ON events(case_id);

-- =========================
-- updated_at トリガー
-- =========================
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
