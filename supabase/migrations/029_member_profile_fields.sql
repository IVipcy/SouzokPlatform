-- ============================================================
-- 029_member_profile_fields.sql
-- プロフィール画面（Phase A）用に members テーブルへフィールドを追加
--   - avatar_url    : Supabase Storage の avatars バケット内 URL（公開）
--   - phone         : 電話番号
--   - bio           : 自己紹介
--   - hobbies       : 趣味（タグ配列）
--   - specialties   : 特技（タグ配列）
--   - hometown      : 出身地
--   - favorite_food : 好きな食べ物
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS avatar_url    TEXT,
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS bio           TEXT,
  ADD COLUMN IF NOT EXISTS hobbies       TEXT[],
  ADD COLUMN IF NOT EXISTS specialties   TEXT[],
  ADD COLUMN IF NOT EXISTS hometown      TEXT,
  ADD COLUMN IF NOT EXISTS favorite_food TEXT;
