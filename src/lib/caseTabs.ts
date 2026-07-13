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
//   個別管理案件  = 紹介のみ
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
  /** 受注区分→業務で許可される実務タブ（serviceMaster由来）。未指定なら全実務タブ表示（従来動作）。 */
  allowedPracticeTabs?: TabKey[]
}

// 業務（受注区分）で出し分ける実務タブ。これら以外（コア）は常に表示。
const GYOMU_GATED_TABS: TabKey[] = ['deceased', 'assets', 'division', 'will', 'registration', 'cancellation', 'trust', 'renunciation', 'mediation', 'probate', 'guardianship', 'succession']
function filterByGyomu(tabs: TabKey[], allowed?: TabKey[]): TabKey[] {
  if (!allowed) return tabs
  return tabs.filter(t => !GYOMU_GATED_TABS.includes(t) || allowed.includes(t))
}

export type TabVisibility = {
  /** 表示するタブ（左→右の順） */
  visible: TabKey[]
  /** タブは残すが末尾に控えめ表示＋既定で非表示（クリックで開ける）にするタブ */
  collapsed: TabKey[]
}

// 管理案件（対応中/完了）で使う実務フルセット（オーダーシート最左、面談情報は末尾）
const FULL_PRACTICE_TABS: TabKey[] = [
  'orderSheet', 'basicInfo', 'assignees', 'ownerSales', 'contractProc', 'clientInfo', 'deceased', 'assets', 'referral',
  'division', 'will', 'registration', 'cancellation', 'trust', 'renunciation', 'mediation', 'probate', 'guardianship', 'succession', 'contract',
  'receipts', 'docs', 'documentCreate', 'tasks', 'meeting',
]

export function getCaseTabVisibility(state: CaseTabState): TabVisibility {
  const { status, allowedPracticeTabs } = state
  const category = getCaseCategory(status)

  // 失注: 案件基本情報グループ（担当者・案件管理）のみ。
  if (status === '失注') {
    return { visible: ['assignees', 'ownerSales'], collapsed: [] }
  }

  // 検討中 / 依頼確定待ち（契約書待ち）/ 受注 / 戻り受注（即受注は status=受注）を統一。
  // 対応中より前はタスク管理をしない（初期対応はアラートで通知）。
  // タブは オーダーシート / 契約手続き / 請求 / 案件基本情報 / 面談情報（固定順・flatOrder表示）。
  // docs / documentCreate はタブではなくヘッダーのボタンとして出すため visible に含める。
  if (status === '検討中' || status === '検討中（契約書待ち）' || status === '受注' || status === '戻り受注') {
    return { visible: ['orderSheet', 'contractProc', 'contract', 'assignees', 'ownerSales', 'meeting', 'receipts', 'docs', 'documentCreate'], collapsed: [] }
  }

  // 管理案件（対応中 / 完了）: 実務フルセット＋面談情報・契約手続きは折りたたみ
  // （契約手続きは対応中までに完了している前提のため「その他」へ畳む）
  if (category === 'management') {
    return { visible: filterByGyomu(FULL_PRACTICE_TABS, allowedPracticeTabs), collapsed: ['meeting', 'contractProc'] }
  }

  // 個別管理案件（紹介のみ）
  if (category === 'referral') {
    return { visible: ['basicInfo', 'meeting', 'clientInfo', 'referral', 'tasks'], collapsed: [] }
  }

  // 相談案件（面談設定済 等）
  // 契約書の授受・受信簿連携のため「到着物」「書類」タブを早い段階から表示する。
  return { visible: ['basicInfo', 'meeting', 'clientInfo', 'receipts', 'docs', 'documentCreate', 'tasks'], collapsed: [] }
}
