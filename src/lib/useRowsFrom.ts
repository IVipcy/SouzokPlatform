'use client'

// 表の行を「ローカルで持ちつつ、サーバーの行が入れ替わったら入れ直す」ための小さなフック。
//
// 実務タブ・面談シートの表は、入力した値をその場で見せるためローカルstateに行を持っている。
// これを useEffect でサーバー由来の配列に同期すると、親が再描画されるたびに行が作り直され、
// 「追加した行が一瞬消える」「入力中の値が元に戻る」といった挙動になる。
// React が勧める書き方（レンダー中に前回値と比べて必要なときだけ入れ直す）に寄せた。
//
// 渡す配列は識別子が安定していること（呼び出し側で filter するなら useMemo で包む）。
// 毎回新しい配列を渡すと、結局レンダーのたびに入れ直されて同じことになる。

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export function useRowsFrom<T>(source: T[]): [T[], Dispatch<SetStateAction<T[]>>] {
  const [rows, setRows] = useState<T[]>(source)
  const [seen, setSeen] = useState(source)
  if (seen !== source) { setSeen(source); setRows(source) }
  return [rows, setRows]
}
