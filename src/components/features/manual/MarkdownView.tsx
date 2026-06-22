import React from 'react'

// マニュアル用の軽量Markdownレンダラ（依存なし）。
// 対応: ## h2 / ### h3 / - 箇条書き / 1. 番号付き / > 注記 / 段落、インライン: **太字** `code` [text](url)
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // リンク → 太字 → コード の順でトークン化（シンプルに正規表現分割）
  const regex = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (lm) nodes.push(<a key={`${keyBase}-${i}`} href={lm[2]} className="text-brand-700 underline hover:text-brand-800">{lm[1]}</a>)
    } else if (tok.startsWith('**')) {
      nodes.push(<strong key={`${keyBase}-${i}`} className="font-bold text-gray-900">{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('`')) {
      nodes.push(<code key={`${keyBase}-${i}`} className="px-1 py-0.5 rounded bg-gray-100 text-[12.5px] font-mono text-gray-800">{tok.slice(1, -1)}</code>)
    }
    last = m.index + tok.length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function MarkdownView({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }
    // 見出し
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++} className="text-[14px] font-bold text-gray-900 mt-4 mb-1.5">{renderInline(line.slice(4), `h${key}`)}</h3>); i++; continue
    }
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++} className="text-[16px] font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-200">{renderInline(line.slice(3), `h${key}`)}</h2>); i++; continue
    }
    // 注記
    if (line.startsWith('> ')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) { buf.push(lines[i].slice(2)); i++ }
      blocks.push(<div key={key++} className="my-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[13px] text-amber-800">{buf.map((b, j) => <p key={j}>{renderInline(b, `q${key}-${j}`)}</p>)}</div>)
      continue
    }
    // 番号付きリスト
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++ }
      blocks.push(<ol key={key++} className="list-decimal pl-5 my-2 space-y-1 text-[13.5px] text-gray-700">{items.map((it, j) => <li key={j}>{renderInline(it, `o${key}-${j}`)}</li>)}</ol>)
      continue
    }
    // 箇条書き
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++ }
      blocks.push(<ul key={key++} className="list-disc pl-5 my-2 space-y-1 text-[13.5px] text-gray-700">{items.map((it, j) => <li key={j}>{renderInline(it, `u${key}-${j}`)}</li>)}</ul>)
      continue
    }
    // 段落（連続行をまとめる）
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !/^(#|>|-|\d+\.)\s/.test(lines[i]) && !lines[i].startsWith('## ') && !lines[i].startsWith('### ')) {
      buf.push(lines[i]); i++
    }
    blocks.push(<p key={key++} className="my-1.5 text-[13.5px] leading-relaxed text-gray-700">{renderInline(buf.join(' '), `p${key}`)}</p>)
  }
  return <div className="manual-body">{blocks}</div>
}
