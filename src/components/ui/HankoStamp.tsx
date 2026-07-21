'use client'

// 「確認済」を示すハンコ（朱印）風スタンプ。全システム共通の意匠。
// 二重丸＋朱色＋serif体＋少し傾き。中に「確認」「氏名」「日付」を配置。
// 押した瞬間だけ animate=true でドスッと落ちる演出。

const RED = '#B94A48'

export default function HankoStamp({ name, at, animate = false, size = 'md' }: {
  name: string | null | undefined
  at?: string | null
  animate?: boolean
  size?: 'sm' | 'md'  // sm=52px（表セル内）、md=60px（履歴・確認簿）
}) {
  const px = size === 'sm' ? 52 : 60
  const dateText = at ? `${new Date(at).getMonth() + 1}/${new Date(at).getDate()}` : ''
  const nameText = (name ?? '').trim() || '—'
  // 3文字を超えると円の中に入りきらないので氏(姓)＋名の先頭でざっくり縮める
  const short = nameText.length <= 4 ? nameText : nameText.replace(/[\s ]+/g, '').slice(0, 4)
  const fsTop  = size === 'sm' ? 7.5 : 9
  const fsMid  = size === 'sm' ? 10.5 : 13
  const fsBot  = size === 'sm' ? 7 : 8
  return (
    <span
      className={`hanko-stamp ${animate ? 'hanko-pop' : ''}`}
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: px, height: px, borderRadius: '50%', border: `2px solid ${RED}`, color: RED,
        fontFamily: 'serif', lineHeight: 1, transform: 'rotate(-4deg)', flex: 'none', position: 'relative',
        boxShadow: 'inset 0 0 0 0.5px ' + RED, padding: 2, boxSizing: 'border-box',
      }}
      title={`${nameText}${at ? ` (${dateText})` : ''}`}
    >
      <span aria-hidden style={{ position: 'absolute', inset: 3, border: `0.5px solid ${RED}`, borderRadius: '50%', pointerEvents: 'none' }} />
      <span style={{ fontSize: fsTop, fontWeight: 700, letterSpacing: 1, marginBottom: 1 }}>確 認</span>
      <span style={{ fontSize: fsMid, fontWeight: 700, marginBottom: 1 }}>{short}</span>
      <span style={{ fontSize: fsBot, fontWeight: 600 }}>{dateText || '—'}</span>
    </span>
  )
}
