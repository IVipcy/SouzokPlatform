-- migration 050: 案件ステータス「紹介のみ」を追加
--
-- 「紹介のみ」= 相談案件として受注に至らなかったが、税理士紹介・不動産査定・
--   遺品整理業者の紹介だけが発生した案件（失注の次のステータス）。
-- 受注担当マイページの「個別管理案件」タブに、このステータスの案件だけを表示する。
--
-- 注: cases.status は CHECK 制約を持たない TEXT 列のため、マスタ追加のみで足りる。

-- ステータスマスタに追加（sort_order は失注=8 の次の 9）
INSERT INTO status_definitions (type, key, label, color, sort_order) VALUES
  ('case', '紹介のみ', '紹介のみ', '#0891B2', 9)
ON CONFLICT (type, key) DO UPDATE
  SET label = EXCLUDED.label, color = EXCLUDED.color, sort_order = EXCLUDED.sort_order;

-- ステータス遷移ルール: 面談設定済 / 検討中 / 失注 から「紹介のみ」へ遷移可能
INSERT INTO status_transitions (type, from_status, to_status, allowed_roles, requires_comment) VALUES
  ('case', '面談設定済', '紹介のみ', '{"sales","manager"}', false),
  ('case', '検討中',     '紹介のみ', '{"sales","manager"}', false),
  ('case', '失注',       '紹介のみ', '{"sales","manager"}', false)
ON CONFLICT DO NOTHING;
