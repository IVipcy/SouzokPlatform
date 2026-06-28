// 到着物（受信簿アイテム）のタスク紐づけ要否判定。
// 契約時受領書類でも、通帳コピー(金融)・戸籍・評価証明(不動産)など調査系はタスクに結べる。
// 契約書・委任状・本人確認書類・印鑑証明書など（区分=契約/その他）はタスク紐づけ不要。
// 未紐づけの催促（案件進捗ハブ）と到着物タブの未紐づけ一覧で同じ判定を共有する。

// タスクが必要な契約時受領カテゴリ（これ以外の契約書類はタスク紐づけ不要）。
export const CONTRACT_TASK_CATEGORIES = new Set(['戸籍', '金融', '不動産', '登記', '財産'])

export type ReceiptItemLike = {
  link_not_required?: boolean | null
  linked_kind?: string | null
  linked_id?: string | null
  item_tasks?: { task: { id: string } | null }[] | null
}

// その到着物が「タスク紐づけ不要」か。
//   手動フラグ(link_not_required)があればそれを優先。
//   無ければ、契約書類(contract_doc)のうちタスク不要カテゴリ(契約/その他)を紐づけ不要とする。
//   通帳コピー(金融)等の調査系は紐づけ対象として残す。
export function isItemNotRequired(it: ReceiptItemLike, contractCat: Map<string, string>): boolean {
  const manual = it.link_not_required ?? null
  if (manual !== null) return manual
  return it.linked_kind === 'contract_doc' && !CONTRACT_TASK_CATEGORIES.has(contractCat.get(it.linked_id ?? '') ?? '')
}

// その到着物が「タスク紐づけ待ち」か（未紐づけ かつ 紐づけ不要でない）。
export function itemNeedsTaskLink(it: ReceiptItemLike, contractCat: Map<string, string>): boolean {
  if ((it.item_tasks ?? []).some(t => t.task?.id)) return false // 既に紐づけ済み
  return !isItemNotRequired(it, contractCat)
}
