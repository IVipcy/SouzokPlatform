-- ============================================================
-- マスタデータ投入
-- ============================================================

-- =========================
-- 1. ロール
-- =========================
INSERT INTO roles (key, label, description, sort_order) VALUES
  ('sales',      '受注担当',           '営業マン。案件の獲得・依頼者との窓口', 1),
  ('manager',    '管理担当',           '進捗管理・タスク割振り・監督', 2),
  ('assistant',  '管理担当アシスタント', 'タスク消化の実行者', 3),
  ('lp',         'LP担当',            'リスティング/LP経由の問合せ対応', 4),
  ('accounting', '経理担当',           '請求・入金・精算管理', 5);

-- =========================
-- 2. 権限マトリクス
-- =========================
INSERT INTO role_permissions (role_id, permission, allowed)
SELECT r.id, p.permission, p.allowed
FROM roles r
CROSS JOIN (VALUES
  -- 受注担当の権限
  ('sales', 'case.status.change', true),
  ('sales', 'task.bulk_generate', false),
  ('sales', 'task.assign', false),
  ('sales', 'task.status.own', true),
  ('sales', 'task.status.others', false),
  ('sales', 'task.wcheck', true),
  ('sales', 'task.manual_add', true),
  ('sales', 'document.generate', false),
  ('sales', 'billing.manage', false),
  ('sales', 'master.edit', false),
  ('sales', 'case.view', true),
  -- 管理担当の権限
  ('manager', 'case.status.change', true),
  ('manager', 'task.bulk_generate', true),
  ('manager', 'task.assign', true),
  ('manager', 'task.status.own', true),
  ('manager', 'task.status.others', true),
  ('manager', 'task.wcheck', true),
  ('manager', 'task.manual_add', true),
  ('manager', 'document.generate', true),
  ('manager', 'billing.manage', true),
  ('manager', 'master.edit', true),
  ('manager', 'case.view', true),
  -- アシスタントの権限
  ('assistant', 'case.status.change', false),
  ('assistant', 'task.bulk_generate', false),
  ('assistant', 'task.assign', false),
  ('assistant', 'task.status.own', true),
  ('assistant', 'task.status.others', false),
  ('assistant', 'task.wcheck', true),
  ('assistant', 'task.manual_add', true),
  ('assistant', 'document.generate', true),
  ('assistant', 'billing.manage', false),
  ('assistant', 'master.edit', false),
  ('assistant', 'case.view', true),
  -- LP担当の権限
  ('lp', 'case.status.change', false),
  ('lp', 'task.bulk_generate', false),
  ('lp', 'task.assign', false),
  ('lp', 'task.status.own', false),
  ('lp', 'task.status.others', false),
  ('lp', 'task.wcheck', false),
  ('lp', 'task.manual_add', false),
  ('lp', 'document.generate', false),
  ('lp', 'billing.manage', false),
  ('lp', 'master.edit', false),
  ('lp', 'case.view', true),
  -- 経理担当の権限
  ('accounting', 'case.status.change', false),
  ('accounting', 'task.bulk_generate', false),
  ('accounting', 'task.assign', false),
  ('accounting', 'task.status.own', true),
  ('accounting', 'task.status.others', false),
  ('accounting', 'task.wcheck', true),
  ('accounting', 'task.manual_add', false),
  ('accounting', 'document.generate', false),
  ('accounting', 'billing.manage', true),
  ('accounting', 'master.edit', false),
  ('accounting', 'case.view', true)
) AS p(role_key, permission, allowed)
WHERE r.key = p.role_key;

-- =========================
-- 3. フェーズ
-- =========================
INSERT INTO phases (key, label, color, sort_order) VALUES
  ('phase1', 'Phase1: 相続人調査',    '#2563EB', 1),
  ('phase2', 'Phase2: 財産調査',      '#7C3AED', 2),
  ('phase3', 'Phase3: 不動産・相続税', '#D97706', 3),
  ('phase4', 'Phase4: 遺産分割',      '#059669', 4),
  ('phase5', 'Phase5: 登記・解約',    '#EA580C', 5),
  ('phase6', 'Phase6: 完了・精算',    '#DC2626', 6);

-- =========================
-- 4. 案件ステータス
-- =========================
INSERT INTO status_definitions (type, key, label, color, sort_order) VALUES
  ('case', '架電案件化', '架電案件化', '#6B7280', 1),
  ('case', '面談設定済', '面談設定済', '#3B82F6', 2),
  ('case', '検討中',     '検討中',     '#D97706', 3),
  ('case', '受注',       '受注',       '#16A34A', 4),
  ('case', '対応中',     '対応中',     '#7C3AED', 5),
  ('case', '保留・長期', '保留・長期', '#EA580C', 6),
  ('case', '完了',       '完了',       '#059669', 7),
  ('case', '失注',       '失注',       '#DC2626', 8);

-- =========================
-- 5. タスクステータス
-- =========================
INSERT INTO status_definitions (type, key, label, color, sort_order) VALUES
  ('task', '未着手',       '未着手',       '#6B7280', 1),
  ('task', '対応中',       '対応中',       '#2563EB', 2),
  ('task', 'Wチェック待ち', 'Wチェック待ち', '#7C3AED', 3),
  ('task', '差戻し',       '差戻し',       '#DC2626', 4),
  ('task', '完了',         '完了',         '#059669', 5);

-- =========================
-- 6. 案件ステータス遷移ルール
-- =========================
INSERT INTO status_transitions (type, from_status, to_status, allowed_roles, requires_comment) VALUES
  ('case', '架電案件化', '面談設定済', '{"sales","manager"}',    false),
  ('case', '面談設定済', '検討中',     '{"sales","manager"}',    false),
  ('case', '面談設定済', '失注',       '{"sales","manager"}',    false),
  ('case', '検討中',     '受注',       '{"sales","manager"}',    false),
  ('case', '検討中',     '失注',       '{"sales","manager"}',    false),
  ('case', '受注',       '対応中',     '{"manager"}',            false),
  ('case', '対応中',     '保留・長期', '{"manager"}',            false),
  ('case', '対応中',     '完了',       '{"manager"}',            false),
  ('case', '保留・長期', '対応中',     '{"manager"}',            false);

-- =========================
-- 7. タスクステータス遷移ルール
-- =========================
INSERT INTO status_transitions (type, from_status, to_status, allowed_roles, requires_comment) VALUES
  ('task', '未着手',       '対応中',       '{"primary","sub","manager"}', false),
  ('task', '対応中',       'Wチェック待ち', '{"primary","sub"}',           false),
  ('task', '対応中',       '未着手',       '{"primary","manager"}',       false),
  ('task', 'Wチェック待ち', '完了',         '{"wcheck_any"}',              false),
  ('task', 'Wチェック待ち', '差戻し',       '{"wcheck_any"}',              true),
  ('task', '差戻し',       '対応中',       '{"primary","sub"}',           false);

-- =========================
-- 8. タスクテンプレート
-- =========================
INSERT INTO task_templates (key, label, phase, category, default_role, sort_order) VALUES
  -- Phase1: 相続人調査
  ('koseki_request_create',    '戸籍請求書作成',              'phase1', '戸籍',     'assistant', 1),
  ('koseki_mail',              '戸籍郵送手配',                'phase1', '戸籍',     'assistant', 2),
  ('koseki_arrive_check',      '戸籍到着確認・読み込み',       'phase1', '戸籍',     'assistant', 3),
  ('koseki_additional',        '追加戸籍請求',                'phase1', '戸籍',     'assistant', 4),
  ('heir_survey_create',       '相続人調査報告書作成',         'phase1', '相続人調査', 'assistant', 5),
  ('family_tree_create',       '法定相続情報一覧図作成',       'phase1', '相続人調査', 'assistant', 6),
  ('family_tree_submit',       '法定相続情報一覧図 法務局提出', 'phase1', '相続人調査', 'assistant', 7),
  ('family_tree_receive',      '法定相続情報一覧図 受領',      'phase1', '相続人調査', 'assistant', 8),

  -- Phase2: 財産調査
  ('bank_balance_request',     '残高証明請求',                'phase2', '金融機関',   'assistant', 10),
  ('bank_balance_arrive',      '残高証明 到着確認',           'phase2', '金融機関',   'assistant', 11),
  ('securities_inquiry',       '証券会社照会',                'phase2', '金融機関',   'assistant', 12),
  ('insurance_inquiry',        '保険会社照会',                'phase2', '保険',       'assistant', 13),
  ('insurance_arrive',         '保険照会結果 到着確認',       'phase2', '保険',       'assistant', 14),
  ('pension_inquiry',          '年金照会',                    'phase2', '年金',       'assistant', 15),
  ('realestate_research',      '不動産調査（謄本・公図等取得）','phase2', '不動産',    'assistant', 16),
  ('realestate_eval',          '不動産評価額算出',            'phase2', '不動産',     'assistant', 17),
  ('debt_inquiry',             '負債調査（信用情報等）',       'phase2', '負債',       'assistant', 18),
  ('asset_list_create',        '財産目録作成',                'phase2', '財産目録',   'assistant', 19),

  -- Phase3: 不動産・相続税
  ('tax_required_check',       '相続税申告要否判定',          'phase3', '相続税',     'manager',   20),
  ('tax_doc_prepare',          '相続税申告書類準備',          'phase3', '相続税',     'assistant', 21),
  ('tax_accountant_handoff',   '税理士への引継ぎ',           'phase3', '相続税',     'manager',   22),
  ('realestate_appraisal',     '不動産鑑定手配',             'phase3', '不動産',     'manager',   23),
  ('realestate_sale_support',  '不動産売却サポート',          'phase3', '不動産',     'manager',   24),

  -- Phase4: 遺産分割
  ('division_draft',           '遺産分割協議書 原案作成',     'phase4', '遺産分割',   'assistant', 30),
  ('division_explain',         '分割案 ご説明',              'phase4', '遺産分割',   'manager',   31),
  ('division_finalize',        '遺産分割協議書 最終版作成',   'phase4', '遺産分割',   'assistant', 32),
  ('division_sign',            '遺産分割協議書 署名捺印手配', 'phase4', '遺産分割',   'assistant', 33),
  ('division_collect',         '遺産分割協議書 回収確認',     'phase4', '遺産分割',   'assistant', 34),

  -- Phase5: 登記・解約
  ('touki_doc_create',         '登記申請書類作成',            'phase5', '登記',       'assistant', 40),
  ('touki_submit',             '登記申請（法務局）',          'phase5', '登記',       'assistant', 41),
  ('touki_complete',           '登記完了確認・謄本取得',       'phase5', '登記',       'assistant', 42),
  ('bank_cancel_request',      '預貯金解約・名義変更手続き',   'phase5', '金融機関',   'assistant', 43),
  ('securities_cancel',        '証券口座移管・解約手続き',     'phase5', '金融機関',   'assistant', 44),
  ('insurance_claim',          '保険金請求手続き',            'phase5', '保険',       'assistant', 45),
  ('car_transfer',             '自動車名義変更',              'phase5', 'その他',     'assistant', 46),

  -- Phase6: 完了・精算
  ('distribution_calc',        '分配金計算書作成',            'phase6', '精算',       'accounting', 50),
  ('invoice_create',           '報酬請求書作成',              'phase6', '精算',       'accounting', 51),
  ('payment_confirm',          '入金確認',                   'phase6', '精算',       'accounting', 52),
  ('distribution_execute',     '分配金送金実行',              'phase6', '精算',       'accounting', 53),
  ('delivery_create',          '納品書類一式作成',            'phase6', '納品',       'assistant',  54),
  ('case_close',               '案件クローズ処理',            'phase6', '納品',       'manager',    55);
