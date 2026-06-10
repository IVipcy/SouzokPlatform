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
//   ・受託・OS未作成      : オーダーシート（作成導線）/ 案件進捗 / 面談情報 / 依頼者情報・やり取り / タスク
//   ・受託・OS作成済      : オーダーシート（最左）＋依頼者情報・やり取り＋実務フルセット（面談情報は残す）
//   ・管理案件            : 実務フルセット。面談情報は折りたたみ（末尾・既定非表示）
//   ※ OS作成後は「依頼者情報・やり取り」タブが復活（やり取り履歴はオーダーシートに含めないため）

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

// 受託OS作成済／管理案件で使う実務フルセット（オーダーシート最左、面談情報は末尾）
const FULL_PRACTICE_TABS: TabKey[] = [
  'orderSheet', 'basicInfo', 'ownerSales', 'clientInfo', 'deceased', 'assets', 'referral',
  'division', 'will', 'registration', 'cancellation', 'contract',
  'docs', 'documentCreate', 'tasks', 'meeting',
]

export function getCaseTabVisibility(state: CaseTabState): TabVisibility {
  const { status, orderSheetCompleted } = state
  const category = getCaseCategory(status)

  // 受託（オーダーシート段階）
  if (status === '受注') {
    if (!orderSheetCompleted) {
      // オーダーシート作成前: 概要把握用の最小構成＋作成導線（オーダーシート最左）
      return { visible: ['orderSheet', 'basicInfo', 'meeting', 'clientInfo', 'tasks'], collapsed: [] }
    }
    // オーダーシート完成後: 実務タブ解禁。面談情報はまだ表示（管理案件化までは折りたたまない）
    return { visible: FULL_PRACTICE_TABS, collapsed: [] }
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
