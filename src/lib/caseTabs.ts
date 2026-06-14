// === 案件詳細タブの表示制御（案件ライフサイクル連動） ===
//
// ステータス（＝案件分類）とオーダーシート完成有無で、表示するタブと並び順、
// および「折りたたみ（末尾に控えめ＋既定非表示）」にするタブを決める。
//
// ⚠️ Phase 1 時点ではまだ画面に配線していない（CaseTabs は従来どおり全タブ表示）。
//    Phase 4 でオーダーシート専用ページ・対応中ガードと同時に本関数を配線する。
//    ここは合意済みのタブ表示ルールを「単一の真実」として明文化したもの。
//
// タブ分類（getCaseCategory）との対応:
//   相談案件      = 面談設定済 / 検討中 / 検討中（契約書待ち） / 受託 / 不受託
//   個別管理案件  = 紹介のみ / 長期保留
//   管理案件      = 対応中 / 完了
//
// ※「依頼者情報」タブ = 既存の「依頼者情報・やり取り」タブ（clientInfo）に統一。
//
// ルール:
//   ・相談案件（受託以外）: 案件進捗 / 面談情報 / 依頼者情報・やり取り / タスク
//   ・個別管理案件        : 案件進捗 / 面談情報 / 依頼者情報・やり取り / 他事業者紹介 / タスク
//   ・受託                : オーダーシート / 案件進捗 / 担当・受注内容 / 面談情報 / 依頼者情報・やり取り / タスク
//        （実務タブはまだ出さない。オーダーシート完成・管理担当アサイン等は対応中への移行条件）
//   ・管理案件（対応中/完了）: 実務フルセットを解禁。面談情報は折りたたみ（末尾・既定非表示）
//        ※ 実務タブは「対応中」になったタイミングで出る（オーダーシート完成では出さない）

import type { TabKey } from '@/components/features/cases/CaseTabs'
import { getCaseCategory } from './constants'

export type CaseTabState = {
  status: string | null | undefined
  orderSheetCompleted: boolean
  /** 他事業者紹介の登録業者数（将来の表示判定用に保持。現状は個別管理案件で常に表示） */
  referralPartnerCount: number
}

export type TabVisibility = {
  /** 表示するタブ（左→右の順） */
  visible: TabKey[]
  /** タブは残すが末尾に控えめ表示＋既定で非表示（クリックで開ける）にするタブ */
  collapsed: TabKey[]
}

// 管理案件（対応中/完了）で使う実務フルセット（オーダーシート最左、面談情報は末尾）
const FULL_PRACTICE_TABS: TabKey[] = [
  'orderSheet', 'basicInfo', 'ownerSales', 'orderContent', 'contractProc', 'clientInfo', 'deceased', 'assets', 'referral',
  'division', 'will', 'registration', 'cancellation', 'contract',
  'docs', 'tasks', 'meeting',
]

export function getCaseTabVisibility(state: CaseTabState): TabVisibility {
  const { status } = state
  const category = getCaseCategory(status)

  // 受託: オーダーシート作成・担当受注内容まで。実務タブは出さないが、
  // 受託段階で前受金等を請求するため「契約・報酬・請求」、契約書等の授受のため「書類」を表示する。
  if (status === '受注') {
    // 面談情報は受託後はオーダーシート・受注内容等に展開済みのため、対応中と同様に「その他」へ畳む。
    // 契約残手続きは受託中に完了させるべき重要タブのため表示（対応中になったら畳む）。
    return { visible: ['orderSheet', 'basicInfo', 'ownerSales', 'orderContent', 'contractProc', 'meeting', 'clientInfo', 'contract', 'docs', 'tasks'], collapsed: ['meeting'] }
  }

  // 管理案件（対応中 / 完了）: 実務フルセット＋面談情報・契約残手続きは折りたたみ
  // （契約残手続きは対応中までに完了している前提のため「その他」へ畳む）
  if (category === 'management') {
    return { visible: FULL_PRACTICE_TABS, collapsed: ['meeting', 'contractProc'] }
  }

  // 個別管理案件（紹介のみ / 長期保留）
  if (category === 'referral') {
    return { visible: ['basicInfo', 'meeting', 'clientInfo', 'referral', 'tasks'], collapsed: [] }
  }

  // 相談案件（面談設定済 / 検討中 / 検討中（契約書待ち） / 不受託）
  // 契約書の授受・受信簿連携のため「書類」タブを早い段階から表示する。
  return { visible: ['basicInfo', 'meeting', 'clientInfo', 'docs', 'tasks'], collapsed: [] }
}
