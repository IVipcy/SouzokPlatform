-- 契約時にもらう書類の名前を実態に合わせる。
--   本人確認書類 → 本人確認書類の写し（原本ではなく写しをもらう）
--   印鑑証明書   → 印鑑登録証明書（正式名称）
--
-- あわせて「本人確認書類の写し」を返却対象から外す。
-- 区分「お客様預かり書類」は納品タブに自動で載って原本受領証に並ぶ仕組みなので、
-- 写し（返さないもの）をこの区分にしておくと、返す物として紙に出てしまう。
-- 印鑑登録証明書は原本をお預かりして返すので、区分はそのまま。

update contract_documents set name = '本人確認書類の写し' where name = '本人確認書類';
update contract_documents set name = '印鑑登録証明書'     where name = '印鑑証明書';

update contract_documents set category = '契約'
  where name = '本人確認書類の写し' and category = 'お客様預かり書類';

-- 面談時に登録した受領書類（cases.intake_documents は jsonb 配列）も同じ言い換えをする。
-- 画面の既定値だけ変えると、既に登録済みの案件だけ古い名前が残るため。
update cases
set intake_documents = (
  select jsonb_agg(
    case
      when d->>'name' = '本人確認書類' then jsonb_set(d, '{name}', '"本人確認書類の写し"')
      when d->>'name' = '印鑑証明書'   then jsonb_set(d, '{name}', '"印鑑登録証明書"')
      else d
    end
    order by ord
  )
  from jsonb_array_elements(cases.intake_documents) with ordinality as t(d, ord)
)
where intake_documents is not null
  and jsonb_typeof(intake_documents) = 'array'
  and exists (
    select 1 from jsonb_array_elements(cases.intake_documents) as e(d)
    where d->>'name' in ('本人確認書類', '印鑑証明書')
  );
