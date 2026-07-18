// フリータスク作成時のやんわり案内用。
// 入力タスク名に「本来は実務タブの行で管理すべき作業」のキーワードが含まれるか判定し、
// 含まれれば該当業務のタブ情報を返す（強制はしない・気づける一言のため）。

type Rule = { kws: string[]; tab: string; tabLabel: string; domain: string }

// 相続登記は「登記情報」と被らないよう先頭で判定する。
const RULES: Rule[] = [
  { kws: ['相続登記'], tab: 'registration', tabLabel: '相続登記タブ', domain: '相続登記' },
  { kws: ['戸籍', '除籍', '改製原'], tab: 'deceased', tabLabel: '相続人調査タブ', domain: '戸籍' },
  { kws: ['名寄帳', '名寄せ', '評価証明', '登記情報', '公図', '地積測量図', '路線価'], tab: 'assets', tabLabel: '財産調査タブ', domain: '不動産' },
  { kws: ['残高証明', '通帳', '預金', '証券', '信託'], tab: 'assets', tabLabel: '財産調査タブ', domain: '金融' },
]

export type TaskKeywordHint = { domain: string; tab: string; tabLabel: string; matched: string }

export function taskKeywordHint(title: string | null | undefined): TaskKeywordHint | null {
  const t = (title ?? '').trim()
  if (!t) return null
  for (const r of RULES) {
    const matched = r.kws.find(kw => t.includes(kw))
    if (matched) return { domain: r.domain, tab: r.tab, tabLabel: r.tabLabel, matched }
  }
  return null
}
