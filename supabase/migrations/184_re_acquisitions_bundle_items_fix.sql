-- 183 の再実装。array_agg(DISTINCT ... ORDER BY ...) OVER w が構文NG（window関数で DISTINCT/ORDER BY 不可）
-- → GROUP BY による集約 + DISTINCT ON による代表行選定に書き直し。
-- 実務では市区町村役場に名寄帳＋評価証明をまとめて／法務局に登記＋公図＋地積測量図をまとめて請求するため、
-- 「1行1資料」だった従来の設計を、item_types(text[]) で複数資料を保持する形に切り替える。

-- 1) item_types 列を追加
ALTER TABLE real_estate_acquisitions ADD COLUMN IF NOT EXISTS item_types TEXT[];

-- 2) 既存行を [item_type] で初期化（未セット・item_type がある行のみ）
UPDATE real_estate_acquisitions
SET item_types = ARRAY[item_type]
WHERE item_types IS NULL AND item_type IS NOT NULL;

-- 3) (case_id, scope, target_property_id, target_municipality) 単位で
--    代表行=先頭行に他行の値を集約
WITH keep AS (
  SELECT DISTINCT ON (case_id, COALESCE(scope,''), COALESCE(target_property_id::text,''), COALESCE(target_municipality,''))
    id AS keep_id,
    case_id,
    COALESCE(scope,'') AS sk,
    COALESCE(target_property_id::text,'') AS pk,
    COALESCE(target_municipality,'') AS mk
  FROM real_estate_acquisitions
  ORDER BY case_id,
           COALESCE(scope,''),
           COALESCE(target_property_id::text,''),
           COALESCE(target_municipality,''),
           sort_order NULLS LAST, created_at NULLS LAST, id
),
agg AS (
  SELECT
    r.case_id,
    COALESCE(r.scope,'') AS sk,
    COALESCE(r.target_property_id::text,'') AS pk,
    COALESCE(r.target_municipality,'') AS mk,
    array_agg(DISTINCT r.item_type) FILTER (WHERE r.item_type IS NOT NULL) AS agg_items,
    MAX(r.request_to)                     AS agg_request_to,
    MAX(r.request_date)                   AS agg_request_date,
    MAX(r.arrival_date)                   AS agg_arrival_date,
    MAX(r.expected_arrival_date)          AS agg_expected_arrival_date,
    bool_or(r.received)                   AS agg_received,
    MAX(r.amount)                         AS agg_amount,
    MAX(r.notes)                          AS agg_notes,
    SUM(r.cost_budget)                    AS agg_cost_budget,
    SUM(r.cost_refund)                    AS agg_cost_refund,
    SUM(r.cost_confirmed)                 AS agg_cost_confirmed,
    MAX(r.request_check_name)             AS agg_req_check_name,
    MAX(r.request_check_at)               AS agg_req_check_at,
    MAX(r.request_check_by::text)         AS agg_req_check_by,
    MAX(r.request_check_requested_at)     AS agg_req_req_at,
    MAX(r.request_check_requested_by::text) AS agg_req_req_by,
    MAX(r.receipt_check_name)             AS agg_rcp_check_name,
    MAX(r.receipt_check_at)               AS agg_rcp_check_at,
    MAX(r.receipt_check_by::text)         AS agg_rcp_check_by,
    MAX(r.receipt_check_requested_at)     AS agg_rcp_req_at,
    MAX(r.receipt_check_requested_by::text) AS agg_rcp_req_by,
    MAX(r.request_done_by::text)          AS agg_req_done_by,
    MAX(r.receipt_done_by::text)          AS agg_rcp_done_by,
    bool_or(r.is_additional)              AS agg_is_additional,
    MAX(r.additional_reason)              AS agg_additional_reason,
    MAX(r.additional_approved_at)         AS agg_additional_approved_at,
    MAX(r.additional_approved_by::text)   AS agg_additional_approved_by
  FROM real_estate_acquisitions r
  GROUP BY r.case_id, COALESCE(r.scope,''), COALESCE(r.target_property_id::text,''), COALESCE(r.target_municipality,'')
)
UPDATE real_estate_acquisitions r
SET item_types                   = COALESCE(a.agg_items, r.item_types),
    request_to                   = COALESCE(a.agg_request_to, r.request_to),
    request_date                 = COALESCE(a.agg_request_date, r.request_date),
    arrival_date                 = COALESCE(a.agg_arrival_date, r.arrival_date),
    expected_arrival_date        = COALESCE(a.agg_expected_arrival_date, r.expected_arrival_date),
    received                     = COALESCE(a.agg_received, r.received),
    amount                       = COALESCE(a.agg_amount, r.amount),
    notes                        = COALESCE(a.agg_notes, r.notes),
    cost_budget                  = COALESCE(a.agg_cost_budget, r.cost_budget),
    cost_refund                  = COALESCE(a.agg_cost_refund, r.cost_refund),
    cost_confirmed               = COALESCE(a.agg_cost_confirmed, r.cost_confirmed),
    request_check_name           = COALESCE(a.agg_req_check_name, r.request_check_name),
    request_check_at             = COALESCE(a.agg_req_check_at, r.request_check_at),
    request_check_by             = COALESCE(a.agg_req_check_by::uuid, r.request_check_by),
    request_check_requested_at   = COALESCE(a.agg_req_req_at, r.request_check_requested_at),
    request_check_requested_by   = COALESCE(a.agg_req_req_by::uuid, r.request_check_requested_by),
    receipt_check_name           = COALESCE(a.agg_rcp_check_name, r.receipt_check_name),
    receipt_check_at             = COALESCE(a.agg_rcp_check_at, r.receipt_check_at),
    receipt_check_by             = COALESCE(a.agg_rcp_check_by::uuid, r.receipt_check_by),
    receipt_check_requested_at   = COALESCE(a.agg_rcp_req_at, r.receipt_check_requested_at),
    receipt_check_requested_by   = COALESCE(a.agg_rcp_req_by::uuid, r.receipt_check_requested_by),
    request_done_by              = COALESCE(a.agg_req_done_by::uuid, r.request_done_by),
    receipt_done_by              = COALESCE(a.agg_rcp_done_by::uuid, r.receipt_done_by),
    is_additional                = COALESCE(a.agg_is_additional, r.is_additional),
    additional_reason            = COALESCE(a.agg_additional_reason, r.additional_reason),
    additional_approved_at       = COALESCE(a.agg_additional_approved_at, r.additional_approved_at),
    additional_approved_by       = COALESCE(a.agg_additional_approved_by::uuid, r.additional_approved_by)
FROM keep k
JOIN agg a ON a.case_id = k.case_id AND a.sk = k.sk AND a.pk = k.pk AND a.mk = k.mk
WHERE r.id = k.keep_id;

-- 4) 代表行以外を削除
DELETE FROM real_estate_acquisitions r
WHERE r.id NOT IN (
  SELECT DISTINCT ON (case_id, COALESCE(scope,''), COALESCE(target_property_id::text,''), COALESCE(target_municipality,''))
    id
  FROM real_estate_acquisitions
  ORDER BY case_id,
           COALESCE(scope,''),
           COALESCE(target_property_id::text,''),
           COALESCE(target_municipality,''),
           sort_order NULLS LAST, created_at NULLS LAST, id
);

-- 5) 統合後、item_types が空なら item_type から補完
UPDATE real_estate_acquisitions
SET item_types = ARRAY[item_type]
WHERE (item_types IS NULL OR array_length(item_types, 1) IS NULL)
  AND item_type IS NOT NULL;

-- 6) PostgREST schema cache をリロード
NOTIFY pgrst, 'reload schema';
