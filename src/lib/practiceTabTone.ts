// 案件詳細タブの地色。誰の持ち場のタブを開いているか、色で分かるようにする。
//   ベージュ … オーダーシート（案件の設計図）
//   ピンク   … 事務管理担当が手を動かす実務タブ
//   緑       … 管理担当が手を動かす実務タブ
// 業務区分の持ち場分け（BulkTaskGenerateModal の MANAGER_GYOMU）と同じ切り方にしている。

import type { TabKey } from '@/components/features/cases/CaseTabs'

// 相続登記は相続登記チームの持ち場（事務管理は受領するだけで到着物受信簿で処理する）。
// 事務管理・管理担当のどちらでもないので地色は付けない。
const ASSISTANT_TABS: TabKey[] = ['deceased', 'assets', 'division', 'cancellation', 'delivery']
const MANAGER_TABS: TabKey[] = [
  'legalInfo', 'referral', 'will', 'trust', 'renunciation', 'mediation',
  'probate', 'guardianship', 'succession', 'letter', 'execution', 'contractCreate',
]

export type TabTone = 'order' | 'assistant' | 'manager' | null

export function toneOfTab(tab: TabKey): TabTone {
  if (tab === 'orderSheet') return 'order'
  if (ASSISTANT_TABS.includes(tab)) return 'assistant'
  if (MANAGER_TABS.includes(tab)) return 'manager'
  return null
}

/** 地色のクラス（薄く敷く程度。文字色は変えない） */
export const TONE_BG: Record<Exclude<TabTone, null>, string> = {
  order: 'bg-[#FBF7EE]',      // 薄いベージュ
  assistant: 'bg-[#FDF3F6]',  // 薄いピンク
  manager: 'bg-[#F1F9F3]',    // 薄い緑
}
