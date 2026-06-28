// 工程（業務区分の1個上のレベル）。実務タブ構成に対応。
// 受注区分 → 工程 → 業務区分 → 作業 の階層で案件進捗を見せるための対応表。
// DBには持たず、業務区分(task.phase)から工程を導出する（マップのみ）。

// 工程の進行順（矢羽根・一覧の並び）。手続き一式の主流れ → 受注区分別系統 → 他事業者紹介 → その他。
export const KOTEI_ORDER = [
  '相続人調査', '財産調査', '遺産分割', '相続登記', '解約手続', '経理',
  '遺言', '信託契約', '相続放棄', '調停', '遺言検認', '成年後見',
  '他事業者紹介', 'その他',
] as const

export type Kotei = (typeof KOTEI_ORDER)[number]

// 工程 → 業務区分（2段階セレクト・グルーピング用）。業務区分の表示順もここで定義。
export const KOTEI_GYOMU: Record<string, string[]> = {
  '相続人調査': ['戸籍', '相関図', '法定相続情報取得'],
  '財産調査': ['不動産', '金融資産', '目録'],
  '遺産分割': ['協議書'],
  '相続登記': ['登記'],
  '解約手続': ['解約'],
  '経理': ['経理'],
  '遺言': ['遺言作成'],
  '信託契約': ['信託契約書作成'],
  '相続放棄': ['放棄手続き'],
  '調停': ['調停手続き'],
  '遺言検認': ['検認手続き'],
  '成年後見': ['後見手続き'],
  '他事業者紹介': ['相続税', '他事業者紹介'],
  'その他': ['手紙', '執行通知', '契約書作成'],
}

// 業務区分 → 工程 の逆引き
const GYOMU_TO_KOTEI: Record<string, string> = Object.entries(KOTEI_GYOMU).reduce((acc, [kotei, gyomus]) => {
  for (const g of gyomus) acc[g] = kotei
  return acc
}, {} as Record<string, string>)

// "PhaseN:" 接頭辞を除いた業務区分名を返す
export function stripGyomu(phase: string | null | undefined): string {
  return (phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()
}

// 業務区分（task.phase）から工程を導出。未知・空は「その他」。
export function koteiOf(phase: string | null | undefined): string {
  const g = stripGyomu(phase)
  if (!g) return 'その他'
  return GYOMU_TO_KOTEI[g] ?? 'その他'
}

// KOTEI_ORDER のインデックス（並び替え用）。未知は末尾。
export function koteiRank(kotei: string): number {
  const i = (KOTEI_ORDER as readonly string[]).indexOf(kotei)
  return i === -1 ? KOTEI_ORDER.length : i
}
