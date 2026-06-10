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
  'orderSheet', 'basicInfo', 'ownerSales', 'clientInfo', 'deceased', 'assets', 'referral',
  'division', 'will', 'registration', 'cancellation', 'contract',
  'docs', 'tasks', 'meeting',
]

export function getCaseTabVisibility(state: CaseTabState): TabVisibility {
  const { status } = state
  const category = getCaseCategory(status)

  // 受託: オーダーシート作成・担当受注内容まで。実務タブは出さないが、
  // 受託段階で前受金等を請求するため「契約・報酬・請求」タブは表示する。
  if (status === '受注') {
    return { visible: ['orderSheet', 'basicInfo', 'ownerSales', 'contract', 'meeting', 'clientInfo', 'tasks'], collapsed: [] }
  }

  // 管理案件（対応中 / 完了）: 実務フルセット＋面談情報は折りたたみ
  if (category === 'management') {
    return { visible: FULL_PRACTICE_TABS, collapsed: ['meeting'] }
  }

  // 個別管理案件（紹介のみ / 長期保留）
  if (category === 'referral') {
    return { visible: ['basicInfo', 'meeting', 'clientInfo', 'referral', 'tasks'], collapsed: [] }
  }

  // 相談案件（面談設定済 / 検討中 / 検討中（契約書待ち） / 不受託）
  return { visible: ['basicInfo', 'meeting', 'clientInfo', 'tasks'], collapsed: [] }
}
