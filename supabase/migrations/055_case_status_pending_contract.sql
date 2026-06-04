-- migration 055: 案件ステータス改修（フェーズ1）
--
-- 1. 新ステータス「検討中（契約書待ち）」を追加（並び順は「検討中」の直後）
--    面談その場で契約できず、後日お客様が契約書を送付してくる待ち状態。
--    検討期間は cases.client_response_due_date（お客様回答予定日）で管理する。
-- 2. 表示ラベルの改称（内部キーは維持して既存ロジックを壊さない）
--    受注 → 受託 / 失注 → 不受注 / 架電案件化 → 新規
--    ※ status_definitions.label のみ更新。cases.status の値（=key）は変更しない。
--
-- 注: cases.status は CHECK 制約を持たない TEXT 列のため、マスタ追加のみで足りる。

-- ── 1. sort_order を空ける（受注=4 以降を +1 シフト）──
UPDATE status_definitions
  SET sort_order = sort_order + 1
  WHERE type = 'case' AND sort_order >= 4;

-- 新ステータスを sort_order 4（検討中=3 の直後）に挿入
INSERT INTO status_definitions (type, key, label, color, sort_order) VALUES
  ('case', '検討中（契約書待ち）', '検討中（契約書待ち）', '#F59E0B', 4)
ON CONFLICT (type, key) DO UPDATE
  SET label = EXCLUDED.label, color = EXCLUDED.color, sort_order = EXCLUDED.sort_order;

-- ── 2. 表示ラベルの改称（key は維持、label のみ更新）──
UPDATE status_definitions SET label = '受託' WHERE type = 'case' AND key = '受注';
UPDATE status_definitions SET label = '不受注' WHERE type = 'case' AND key = '失注';
UPDATE status_definitions SET label = '新規' WHERE type = 'case' AND key = '架電案件化';

-- ── 3. ステータス遷移ルール ──
-- 面談設定済 / 検討中 から「検討中（契約書待ち）」へ、そこから受注・失注・紹介のみへ。
INSERT INTO status_transitions (type, from_status, to_status, allowed_roles, requires_comment) VALUES
  ('case', '面談設定済',         '検討中（契約書待ち）', '{"sales","manager"}', false),
  ('case', '検討中',             '検討中（契約書待ち）', '{"sales","manager"}', false),
  ('case', '検討中（契約書待ち）', '受注',                '{"sales","manager"}', false),
  ('case', '検討中（契約書待ち）', '失注',                '{"sales","manager"}', false),
  ('case', '検討中（契約書待ち）', '紹介のみ',            '{"sales","manager"}', false)
ON CONFLICT DO NOTHING;
