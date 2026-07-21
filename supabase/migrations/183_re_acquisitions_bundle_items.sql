-- 不動産取得資料を「1宛先＝1請求（＝1行）＋資料は複数選択」の設計に変更。
-- 実務では市区町村役場に名寄帳＋評価証明をまとめて／法務局に登記＋公図＋地積測量図をまとめて請求するため、
-- 「1行1資料」だった従来の設計を、item_types(text[]) で複数資料を保持する形に切り替える。
-- 既存データは (case_id, scope, target_property_id, target_municipality) でグルーピングして1行に統合。

-- 1) item_types 列を追加（複数資料を保持）
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS item_types TEXT[];

-- 2) まず既存行を [item_type] で初期化（未セット・item_type がある行のみ）
UPDATE real_estate_acquisitions
SET item_types = ARRAY[item_type]
WHERE item_types IS NULL AND item_type IS NOT NULL;

-- 3) (case_id, scope, target_property_id, target_municipality) でグルーピングして
--    「代表行（=最も情報が入っている行）」に他の行の item_type / 日付 / 費用 / チェック を集約。
--    - item_types: 全行のitem_typeをdistinct配列で集約
--    - 各テキスト/日付/数値列: MAX (非NULLを優先)
--    - is_additional: bool_or（1つでも追加＝追加）
--    - additional_approved_at: 最初の非NULL（bool_or と対応）
--    集約後、代表行以外は削除。
WITH grouped AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY case_id,
                   COALESCE(scope, ''),
                   COALESCE(target_property_id::text, ''),
                   COALESCE(target_municipality, '')
      ORDER BY sort_order NULLS LAST, created_at NULLS LAST, id
    ) AS rn,
    -- 集約用（同じグループ内で共有）
    (array_agg(DISTINCT item_type ORDER BY item_type) FILTER (WHERE item_type IS NOT NULL)) OVER w AS agg_items,
    MAX(request_to)                  OVER w AS agg_request_to,
    MAX(request_date)                OVER w AS agg_request_date,
    MAX(arrival_date)                OVER w AS agg_arrival_date,
    MAX(expected_arrival_date)       OVER w AS agg_expected_arrival_date,
    bool_or(received)                OVER w AS agg_received,
    MAX(amount)                      OVER w AS agg_amount,
    MAX(notes)                       OVER w AS agg_notes,
    SUM(cost_budget)                 OVER w AS agg_cost_budget,
    SUM(cost_refund)                 OVER w AS agg_cost_refund,
    SUM(cost_confirmed)              OVER w AS agg_cost_confirmed,
    MAX(request_check_name)          OVER w AS agg_req_check_name,
    MAX(request_check_at)            OVER w AS agg_req_check_at,
    MAX(request_check_by::text)      OVER w AS agg_req_check_by,
    MAX(request_check_requested_at)  OVER w AS agg_req_req_at,
    MAX(request_check_requested_by::text) OVER w AS agg_req_req_by,
    MAX(receipt_check_name)          OVER w AS agg_rcp_check_name,
    MAX(receipt_check_at)            OVER w AS agg_rcp_check_at,
    MAX(receipt_check_by::text)      OVER w AS agg_rcp_check_by,
    MAX(receipt_check_requested_at)  OVER w AS agg_rcp_req_at,
    MAX(receipt_check_requested_by::text) OVER w AS agg_rcp_req_by,
    MAX(request_done_by::text)       OVER w AS agg_req_done_by,
    MAX(receipt_done_by::text)       OVER w AS agg_rcp_done_by,
    bool_or(is_additional)           OVER w AS agg_is_additional,
    MAX(additional_reason)           OVER w AS agg_additional_reason,
    MAX(additional_approved_at)      OVER w AS agg_additional_approved_at,
    MAX(additional_approved_by::text) OVER w AS agg_additional_approved_by
  FROM real_estate_acquisitions
  WINDOW w AS (PARTITION BY case_id,
                             COALESCE(scope, ''),
                             COALESCE(target_property_id::text, ''),
                             COALESCE(target_municipality, ''))
)
UPDATE real_estate_acquisitions r
SET item_types                   = COALESCE(g.agg_items, r.item_types),
    request_to                   = COALESCE(g.agg_request_to, r.request_to),
    request_date                 = COALESCE(g.agg_request_date, r.request_date),
    arrival_date                 = COALESCE(g.agg_arrival_date, r.arrival_date),
    expected_arrival_date        = COALESCE(g.agg_expected_arrival_date, r.expected_arrival_date),
    received                     = COALESCE(g.agg_received, r.received),
    amount                       = COALESCE(g.agg_amount, r.amount),
    notes                        = COALESCE(g.agg_notes, r.notes),
    cost_budget                  = COALESCE(g.agg_cost_budget, r.cost_budget),
    cost_refund                  = COALESCE(g.agg_cost_refund, r.cost_refund),
    cost_confirmed               = COALESCE(g.agg_cost_confirmed, r.cost_confirmed),
    request_check_name           = COALESCE(g.agg_req_check_name, r.request_check_name),
    request_check_at             = COALESCE(g.agg_req_check_at, r.request_check_at),
    request_check_by             = COALESCE(g.agg_req_check_by::uuid, r.request_check_by),
    request_check_requested_at   = COALESCE(g.agg_req_req_at, r.request_check_requested_at),
    request_check_requested_by   = COALESCE(g.agg_req_req_by::uuid, r.request_check_requested_by),
    receipt_check_name           = COALESCE(g.agg_rcp_check_name, r.receipt_check_name),
    receipt_check_at             = COALESCE(g.agg_rcp_check_at, r.receipt_check_at),
    receipt_check_by             = COALESCE(g.agg_rcp_check_by::uuid, r.receipt_check_by),
    receipt_check_requested_at   = COALESCE(g.agg_rcp_req_at, r.receipt_check_requested_at),
    receipt_check_requested_by   = COALESCE(g.agg_rcp_req_by::uuid, r.receipt_check_requested_by),
    request_done_by              = COALESCE(g.agg_req_done_by::uuid, r.request_done_by),
    receipt_done_by              = COALESCE(g.agg_rcp_done_by::uuid, r.receipt_done_by),
    is_additional                = COALESCE(g.agg_is_additional, r.is_additional),
    additional_reason            = COALESCE(g.agg_additional_reason, r.additional_reason),
    additional_approved_at       = COALESCE(g.agg_additional_approved_at, r.additional_approved_at),
    additional_approved_by       = COALESCE(g.agg_additional_approved_by::uuid, r.additional_approved_by)
FROM grouped g
WHERE r.id = g.id AND g.rn = 1;

-- 4) 代表行以外を削除
WITH grouped AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY case_id,
                   COALESCE(scope, ''),
                   COALESCE(target_property_id::text, ''),
                   COALESCE(target_municipality, '')
      ORDER BY sort_order NULLS LAST, created_at NULLS LAST, id
    ) AS rn
  FROM real_estate_acquisitions
)
DELETE FROM real_estate_acquisitions r
USING grouped g
WHERE r.id = g.id AND g.rn > 1;

-- 5) 統合後、item_types が空なら item_type から補完
UPDATE real_estate_acquisitions
SET item_types = ARRAY[item_type]
WHERE (item_types IS NULL OR array_length(item_types, 1) IS NULL)
  AND item_type IS NOT NULL;
