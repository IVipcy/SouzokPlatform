// 到着物受信簿の「到着物 ⇄ 実務タブの行」の結び付きまわり。
//
// 到着物は登録時に「受領待ちの到着物から選ぶ」で実務タブの行（戸籍請求・取得資料・金融資産…）に結ばれ、
// linked_kind / linked_id / linked_field を持つ。ここではその結び付きから
//   ・各タブへの到着日の書き込み（登録時。W-Check は廃止＝migration 280）
//   ・「対応」で作るタスクの着地先（source_rid）と既定のタスク名・作業内容
// を作る。

import type { SupabaseClient } from '@supabase/supabase-js'

type LinkedItem = { linked_kind: string | null; linked_id: string | null; linked_field: string | null }

/** 結び先のテーブル名 */
const tableOf = (kind: string) =>
  kind === 'financial_asset' ? 'financial_assets'
  : kind === 'koseki' ? 'koseki_requests'
  : kind === 'contract_doc' ? 'contract_documents'
  : kind === 'real_estate_acquisition' ? 'real_estate_acquisitions'
  : kind === 'legal_info' ? 'cases'   // 法定相続情報一覧図の取得日は cases.family_tree_obtain_date
  : 'real_estate_properties'

/** 到着日を各タブへ書く（date=null で取り消し）。協議書の返送は受領済(boolean)も連動 */
export async function applyReceiptLinkDates(supabase: SupabaseClient, items: LinkedItem[], date: string | null): Promise<boolean> {
  const jobs = items
    .filter(i => i.linked_kind && i.linked_id && i.linked_field)
    .map(i => {
      if (i.linked_kind === 'agreement_dispatch') {
        return supabase.from('agreement_dispatches').update({ received_date: date, received: date != null }).eq('id', i.linked_id as string)
      }
      return supabase.from(tableOf(i.linked_kind as string)).update({ [i.linked_field as string]: date }).eq('id', i.linked_id as string)
    })
  if (jobs.length === 0) return true
  const results = await Promise.all(jobs)
  return !results.some(r => r.error)
}

/** 到着物の種類 → 業務（タスクの業務欄の既定） */
export const RECEIPT_KIND_GYOMU: Record<string, string> = {
  koseki: '戸籍',
  financial_asset: '金融資産',
  real_estate_acquisition: '不動産',
  real_estate: '不動産',
  agreement_dispatch: '協議書',
  legal_info: '法定相続情報取得',
}

/** 実務タブに読込結果を書く種類（タスク名を「〜の読み込み」にする） */
const READ_KINDS = new Set(['koseki', 'financial_asset', 'real_estate_acquisition', 'real_estate', 'legal_info'])

const READ_TAB_LABEL: Record<string, string> = {
  koseki: '戸籍請求タブの読込結果（取得の結果・内容）',
  financial_asset: '財産調査タブ（金融）の読込結果',
  real_estate_acquisition: '財産調査タブ（不動産）の取得資料の読込結果',
  real_estate: '財産調査タブ（不動産）の評価額',
  legal_info: '法定相続一覧図タブ',
}

export type ReceiptTaskDefaults = { title: string; work: string; gyomu: string; isRead: boolean }

/** 「対応」で作るタスクの既定（名前・作業内容・業務）。到着物の名前と種類から決める */
export function receiptTaskDefaults(itemName: string, linkedKind: string | null, contractGyomu?: string): ReceiptTaskDefaults {
  const name = itemName.trim() || '到着物'
  const kind = linkedKind ?? ''
  if (READ_KINDS.has(kind)) {
    return {
      title: `${name} の読み込み`,
      work: `届いた「${name}」を読み、${READ_TAB_LABEL[kind]}を入力する。`,
      gyomu: RECEIPT_KIND_GYOMU[kind],
      isRead: true,
    }
  }
  // 手で名前を打った到着物でも、登記識別情報通知・登記完了証・登記事項証明書は「登記」の業務に寄せる。
  // 確認タスクを完了するとき「権利書の製本」（相続登記チーム）が候補に出る。
  const isTouki = /識別情報|登記完了|登記事項証明|登記情報/.test(name)
  return {
    title: `${name} の確認`,
    work: isTouki
      ? `届いた「${name}」の内容（受付番号・物件・名義）を確認し、相続登記タブの物件に完了日を入れる。完了時に「権利書の製本」を相続登記チームへ。`
      : `届いた「${name}」の内容を確認する。`,
    gyomu: RECEIPT_KIND_GYOMU[kind] ?? (isTouki ? '登記' : undefined) ?? contractGyomu ?? 'その他',
    isRead: false,
  }
}

/**
 * 到着物の結び先から、タスクの着地先（source_rid）を作る。
 * 戸籍は請求IDそのまま。金融・不動産は名前がキーなので行を引いて名前を取る。決められなければ null。
 * 返り値の label は「📍 着地先」の表示用。
 */
export async function receiptItemLanding(supabase: SupabaseClient, item: LinkedItem): Promise<{ rid: string | null; label: string }> {
  const kind = item.linked_kind ?? ''
  const id = item.linked_id ?? ''
  if (!kind || !id) return { rid: null, label: '（結び先なし）実務タブの一覧に着地します' }
  if (kind === 'koseki') {
    const { data } = await supabase.from('koseki_requests').select('request_to, target_person').eq('id', id).maybeSingle()
    const r = data as { request_to: string | null; target_person: string | null } | null
    const who = (r?.target_person ?? '').trim() || '対象者未設定'
    const dest = (r?.request_to ?? '').trim() || '請求先未設定'
    return { rid: `koseki-read:${id}`, label: `戸籍請求タブ ＞ ${who} ＞ ${dest}の請求` }
  }
  if (kind === 'financial_asset') {
    const { data } = await supabase.from('financial_assets').select('institution_name').eq('id', id).maybeSingle()
    const name = ((data as { institution_name: string | null } | null)?.institution_name ?? '').trim()
    return name ? { rid: `fin-read:${name}`, label: `財産調査タブ（金融） ＞ ${name}` } : { rid: null, label: '財産調査タブ（金融）の一覧に着地します' }
  }
  if (kind === 'real_estate_acquisition') {
    const { data } = await supabase.from('real_estate_acquisitions').select('target_municipality').eq('id', id).maybeSingle()
    const muni = ((data as { target_municipality: string | null } | null)?.target_municipality ?? '').trim()
    return muni ? { rid: `re-muni-read:${muni}`, label: `財産調査タブ（不動産） ＞ ${muni}` } : { rid: null, label: '財産調査タブ（不動産）に着地します' }
  }
  if (kind === 'legal_info') return { rid: 'family-tree-recv', label: '法定相続一覧図タブ' }
  if (kind === 'agreement_dispatch') return { rid: null, label: '遺産分割協議書タブ' }
  if (kind === 'real_estate') return { rid: null, label: '財産調査タブ（不動産）' }
  return { rid: null, label: '（結び先なし）実務タブの一覧に着地します' }
}
