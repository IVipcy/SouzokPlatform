-- ============================================================
-- 233_case_number_route_backfill.sql
-- 案件管理番号（YYMM + 経路コード + 当日連番）の真ん中が XX のままの案件を直す。
--
-- XX は「経路がまだ選ばれていない」状態で採番したときの仮の値。
-- /intake の下書きは最初の入力で案件を作るため必ず XX で始まり、
-- これまで経路が入っても番号が書き換わらず XX のまま残っていた。
-- 以後はアプリ側（src/lib/caseNumber.ts）が経路の保存時に直すので、
-- ここでは既存データだけを一度だけ直す。
--
-- 経路コードは src/lib/constants.ts の ORDER_ROUTE_CODES と同じ。
--   LP経由=LP / 葬儀社(主要・その他・旧)=SD / HP経由=HP / 過去客経由=PC / 税理士経由=ZE / その他=OT
-- 経路が未入力の案件は XX のまま残す（決まっていないものを勝手に決めない）。
-- 同じ番号が既にある場合も書き換えない（重複を作らない）。
-- ============================================================

UPDATE cases c
SET case_number = substr(c.case_number, 1, 4) || t.code || substr(c.case_number, 7)
FROM (
  SELECT id,
    CASE order_route
      WHEN 'LP経由'           THEN 'LP'
      WHEN '主要取引先葬儀社' THEN 'SD'
      WHEN 'その他葬儀社'     THEN 'SD'
      WHEN '葬儀社経由'       THEN 'SD'
      WHEN 'HP経由'           THEN 'HP'
      WHEN '過去客経由'       THEN 'PC'
      WHEN '税理士経由'       THEN 'ZE'
      WHEN 'その他'           THEN 'OT'
    END AS code
  FROM cases
  WHERE case_number ~ '^\d{4}XX\d{4}$'
) t
WHERE c.id = t.id
  AND t.code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cases x
    WHERE x.case_number = substr(c.case_number, 1, 4) || t.code || substr(c.case_number, 7)
  );
