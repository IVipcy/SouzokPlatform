-- ============================================================
-- 159_order_win_type.sql
-- 受注の獲得区分（order_win_type）を追加。ステータスkeyは「受注」1本のまま、
-- 面談結果で選んだ「即受注 / 面談なし受注」を本カラムで区別する（B案）。
--   ・即受注     : 面談設定済からその場で受注（面談結果=即受注）
--   ・面談なし受注 : 税理士/過去客ルート等、面談なしで受注（面談結果=面談なし受注）
--   ・NULL       : 依頼確定待ち→受注 で確定した通常受注（戻り受注は別ステータスkey）
-- 併せて、廃止する「保留・長期（長期保留）」ステータスの既存データを「紹介のみ」へ寄せる。
-- ============================================================

-- 1) 獲得区分カラムを追加
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS order_win_type text;

COMMENT ON COLUMN cases.order_win_type IS '受注の獲得区分（即受注/面談なし受注。通常受注はNULL）。status=受注 のときのみ意味を持つ';

-- 2) 既存の instant_order=true（＝その場受注）を「即受注」として初期反映
UPDATE cases
  SET order_win_type = '即受注'
  WHERE instant_order = true
    AND status = '受注'
    AND order_win_type IS NULL;

-- 3) 廃止ステータス「保留・長期」を「紹介のみ」へ移行（システムから長期保留を完全削除）
--    ※ 既存案件が無ければ 0 件更新で問題なし。
UPDATE cases
  SET status = '紹介のみ'
  WHERE status = '保留・長期';
