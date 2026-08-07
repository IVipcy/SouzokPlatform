// 相続人間の精算計算。財産目録の割付から「実際に誰が誰にいくら渡すか」を出す。
//
// 考え方：
//   取得（プラス財産）− 負担（債務・費用）＝ その人の取り分。ここまでは目録の合計で出ている。
//   ただし葬儀費用のように誰かが既に立て替えていると、取り分が合っていても現金が動いていない。
//   立て替えた人には戻さないといけないので、
//
//       過不足 ＝ 立替額 − 負担額
//
//   がプラスなら受け取る側、マイナスなら払う側になる。全員を足すと必ず0になる
//   （立替額の合計＝負担額の合計＝債務・費用の総額）ので、プラス側とマイナス側を
//   突き合わせれば送金の組み合わせが決まる。
//
// 例）預金3,000万を1,500万ずつ・葬儀費用200万（長男が立替）を100万ずつ負担
//     長男 過不足＝200−100＝+100万（受け取る）／二男 過不足＝0−100＝−100万（払う）
//     → 二男から長男へ100万。預金を長男1,600万・二男1,400万で分けても同じ結果になる。

import { isNegativeClass } from '@/lib/constants'
import type { AssetInventoryRow, HeirRow } from '@/types'

export type HeirFigure = {
  heirId: string
  name: string
  /** プラス財産の取得額 */
  gain: number
  /** 引き受けた債務・費用 */
  burden: number
  /** 自分が立て替えて既に払った額 */
  advanced: number
  /** 取り分（取得 − 負担） */
  net: number
  /** 過不足（立替 − 負担）。プラス＝受け取る、マイナス＝払う */
  balance: number
}

export type Transfer = { fromId: string; fromName: string; toId: string; toName: string; amount: number }

export function computeHeirSettlement(rows: AssetInventoryRow[], takers: HeirRow[]): {
  figures: HeirFigure[]
  transfers: Transfer[]
  /** 立替が1件もなければ精算は発生しない（パネルを出す必要がない） */
  hasAdvance: boolean
} {
  const figures: HeirFigure[] = takers.map(h => {
    let gain = 0, burden = 0, advanced = 0
    for (const r of rows) {
      const v = r.allocations?.[h.id] ?? 0
      if (isNegativeClass(r.asset_class)) {
        burden += v
        if (r.payer_heir_id === h.id) advanced += r.amount ?? 0
      } else {
        gain += v
      }
    }
    return { heirId: h.id, name: h.name || '（氏名未入力）', gain, burden, advanced, net: gain - burden, balance: advanced - burden }
  })

  // 過不足のプラス側（受け取る人）とマイナス側（払う人）を突き合わせる。
  // 少額の端数で送金が細切れにならないよう、1円未満は無視する。
  const receivers = figures.filter(f => f.balance > 0.5).map(f => ({ f, rest: f.balance }))
  const payers = figures.filter(f => f.balance < -0.5).map(f => ({ f, rest: -f.balance }))
  const transfers: Transfer[] = []
  let ri = 0
  for (const p of payers) {
    while (p.rest > 0.5 && ri < receivers.length) {
      const r = receivers[ri]
      const amount = Math.min(p.rest, r.rest)
      transfers.push({ fromId: p.f.heirId, fromName: p.f.name, toId: r.f.heirId, toName: r.f.name, amount: Math.round(amount) })
      p.rest -= amount
      r.rest -= amount
      if (r.rest <= 0.5) ri++
    }
  }

  return { figures, transfers, hasAdvance: figures.some(f => f.advanced > 0) }
}
