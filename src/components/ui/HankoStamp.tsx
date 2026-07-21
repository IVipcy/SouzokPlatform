'use client'

// 「確認済」を示すハンコ（朱印）風スタンプ。全システム共通の意匠。
// 円の中は「苗字だけ」（漢字2文字まで）で崩れないようにし、フルネーム＋日付は円の下に小さく縦積みで表示。
// 押した瞬間だけ animate=true でドスッと落ちる演出（円のみアニメ・下のテキストは静止）。

const RED = '#B94A48'

// 「事務テスト」→「事務」／「管理良子」→「管理」／「高橋 花子」→「高橋」など、
// 空白で姓名を切り、無ければ先頭2文字を姓とみなす（多くの日本人名で成立）。
function familyName(name: string): string {
  const t = name.trim()
  if (!t) return '—'
  const parts = t.split(/[\s　]+/).filter(Boolean)
  const head = parts[0] ?? t
  return head.length >= 2 ? head.slice(0, 2) : head
}

export default function HankoStamp({ name, at, animate = false, size = 'md' }: {
  name: string | null | undefined
  at?: string | null
  animate?: boolean
  size?: 'sm' | 'md'  // sm=38px（表セル内）、md=46px（履歴・確認簿）
}) {
  const px = size === 'sm' ? 38 : 46
  const fontMain = size === 'sm' ? 15 : 19
  const nameText = (name ?? '').trim() || '—'
  const surname = familyName(nameText)
  const dateText = at
    ? size === 'sm'
      ? `${new Date(at).getMonth() + 1}/${new Date(at).getDate()}`
      : (() => { const d = new Date(at); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` })()
    : ''

  return (
    <span
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 'none', lineHeight: 1.2 }}
      title={`${nameText}${at ? ` (${dateText})` : ''}`}
    >
      {/* 朱色の円（ハンコ本体・中は苗字だけ） */}
      <span
        className={animate ? 'hanko-pop' : undefined}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: px, height: px, borderRadius: '50%', border: `2px solid ${RED}`, color: RED,
          fontFamily: 'serif', fontWeight: 700, fontSize: fontMain, lineHeight: 1,
          transform: 'rotate(-4deg)', boxShadow: `inset 0 0 0 0.5px ${RED}`,
        }}
      >
        <span aria-hidden style={{ position: 'absolute', inset: 3, border: `0.5px solid ${RED}`, borderRadius: '50%', pointerEvents: 'none' }} />
        {surname}
      </span>
      {/* 下にフルネーム＋日付（小さく） */}
      <span style={{ fontSize: size === 'sm' ? 10.5 : 11.5, fontWeight: 500, color: 'var(--color-gray-800, #1F2937)', textAlign: 'center', whiteSpace: 'nowrap' }}>{nameText}</span>
      {dateText && (
        <span style={{ fontSize: size === 'sm' ? 9.5 : 10.5, color: 'var(--color-gray-500, #6B7280)', whiteSpace: 'nowrap' }}>{dateText}</span>
      )}
    </span>
  )
}
