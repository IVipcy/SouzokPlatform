'use client'

// 「確認済」を示すハンコ（朱印）風スタンプ。全システム共通の意匠。
// 二重丸＋朱色＋serif体＋少し傾き。中に「確認」「氏名」「日付」を配置。
// 押した瞬間だけ animate=true でドスッと落ちる演出。

const RED = '#B94A48'

export default function HankoStamp({ name, at, animate = false, size = 'md' }: {
  name: string | null | undefined
  at?: string | null
  animate?: boolean
  size?: 'sm' | 'md'  // sm=44px（表セル内）、md=56px（履歴・確認簿）
}) {
  const px = size === 'sm' ? 44 : 56
  const dateText = at ? `${new Date(at).getMonth() + 1}/${new Date(at).getDate()}` : ''
  const nameText = (name ?? '').trim() || '—'
  // 3文字を超えると円の中に入りきらないので氏(姓)＋名の先頭でざっくり縮める
  const short = nameText.length <= 4 ? nameText : nameText.replace(/[\s ]+/g, '').slice(0, 4)
  return (
    <span
      className={`hanko-stamp ${animate ? 'hanko-pop' : ''}`}
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: px, height: px, borderRadius: '50%', border: `2px solid ${RED}`, color: RED,
        fontFamily: 'serif', lineHeight: 1, transform: 'rotate(-4deg)', flex: 'none', position: 'relative',
        boxShadow: 'inset 0 0 0 0.5px ' + RED,
      }}
      title={`${nameText}${at ? ` (${dateText})` : ''}`}
    >
      <span aria-hidden style={{ position: 'absolute', inset: 3, border: `0.5px solid ${RED}`, borderRadius: '50%' }} />
      <span style={{ fontSize: size === 'sm' ? 7 : 8.5, fontWeight: 700, marginTop: size === 'sm' ? 4 : 5, letterSpacing: 1 }}>確 認</span>
      <span style={{ fontSize: size === 'sm' ? 10 : 12, fontWeight: 700, margin: '2px 0' }}>{short}</span>
      <span style={{ fontSize: size === 'sm' ? 6.5 : 7.5, fontWeight: 600, marginBottom: size === 'sm' ? 4 : 5 }}>{dateText || '—'}</span>
    </span>
  )
}
