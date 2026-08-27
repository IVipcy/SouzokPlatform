-- タスクは「作った時点で着手OK」の運用に一本化する（2026-08-27）。
--
-- タスク追加モーダルから「設定しない／着手OK／受領次第OK」の選択を廃止し、
-- 新規タスクは常に ready_reason を持って作られるようになった。
-- 既存の着手前タスクも同じ扱いにそろえる：
--   ・ready_reason が無いもの → 付ける
--   ・受領次第OK（ready_on_receipt=true）で待っていたもの → 着手OKへ切り替える
-- 対応中・完了のタスクには触らない。

UPDATE tasks
SET ext_data = coalesce(ext_data, '{}'::jsonb)
  || jsonb_build_object('ready_reason', '着手OK', 'ready_on_receipt', false)
WHERE status IN ('着手前', '未着手')
  AND (
    coalesce(ext_data->>'ready_reason', '') = ''
    OR coalesce((ext_data->>'ready_on_receipt')::boolean, false) = true
  );
