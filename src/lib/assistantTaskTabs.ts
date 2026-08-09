// 事務管理タスク一覧のタブ定義。
//
// 受注区分 → 実施業務 → タスクのフェーズ(phase) → 実務タブ が1本の系統なので、
// タブ名もそこに合わせる（相続人調査・解約手続・相続登記・納品＝実務タブ名、
// 不動産調査・金融資産調査＝実施業務の呼び名）。
// 「各種作成物」「その他」だけがこの一覧のための新しい括り。
//
// 以前は工程(KOTEI)で絞らせていたが、実務と対応しない中間の括りだったため置き換えた。

export type AssistantTab = { key: string; label: string; gyomus: string[] }

export const ASSISTANT_TASK_TABS: AssistantTab[] = [
  { key: 'heirs',     label: '相続人調査',   gyomus: ['戸籍'] },
  { key: 'realestate', label: '不動産調査',  gyomus: ['不動産'] },
  { key: 'finance',   label: '金融資産調査', gyomus: ['金融資産'] },
  { key: 'cancel',    label: '解約手続',     gyomus: ['解約'] },
  { key: 'touki',     label: '相続登記',     gyomus: ['登記'] },
  { key: 'docs',      label: '各種作成物',   gyomus: ['相関図', '目録', '協議書'] },
  { key: 'delivery',  label: '納品',         gyomus: ['納品'] },
  // その他＝どのタブにも入らない業務ぜんぶ（gyomus は空。判定は tabKeyOfGyomu 側）
  { key: 'other',     label: 'その他',       gyomus: [] },
]

const GYOMU_TO_TAB: Record<string, string> = ASSISTANT_TASK_TABS.reduce((acc, t) => {
  for (const g of t.gyomus) acc[g] = t.key
  return acc
}, {} as Record<string, string>)

/** 業務区分 → タブキー。どのタブにも属さない業務は 'other' に落とす。 */
export const tabKeyOfGyomu = (gyomu: string | null | undefined): string =>
  GYOMU_TO_TAB[(gyomu ?? '').trim()] ?? 'other'
