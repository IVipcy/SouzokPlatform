'use client'

// オーダーシート「郵送先情報一覧」。どの受注区分でも出す。
//   1行＝郵送先になりうる人（依頼者・相続人）。氏名／区分（依頼者・相続人）／住所①（都道府県〜番地）／住所②（建物名・部屋番号）。
//   別の表は持たない。相続人一覧（heirs）の住所そのものをここで直す（区分＝heirs.is_client）。
//   相続人一覧に依頼者がいないときだけ、依頼者情報（clients）の住所を先頭の行に出す（保存先は clients）。
//   納品の受領先・封筒の宛先・原本受領証の郵送先は、この同じ住所を使う（相続人＋依頼者の順で候補に出る）。
//   亡くなっている相続人は郵送先にならないので出さない。

import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, HeirRow } from '@/types'

const inp = 'input-flat w-full px-2 py-1 text-[14px] text-gray-800 outline-none'
const KIND_OPTIONS = ['依頼者', '相続人'] as const

export default function MailingAddressList({ caseData, heirs, patchClient, onRefresh }: {
  caseData: CaseRow
  heirs: HeirRow[]
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  onRefresh?: () => void
}) {
  const alive = heirs.filter(h => !h.is_deceased)
  const hasClientHeir = alive.some(h => h.is_client)
  const client = caseData.clients ?? null

  const saveHeir = async (h: HeirRow, patch: Partial<Pick<HeirRow, 'address' | 'address2' | 'is_client'>>) => {
    const { error } = await createClient().from('heirs').update(patch).eq('id', h.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const saveClient = async (field: 'address' | 'address2', v: string) => {
    if ((client?.[field] ?? '') === v) return
    await patchClient({ [field]: v || null })
  }

  const head = 'text-[11.5px] text-gray-400 pb-1'
  const rowCls = 'grid grid-cols-[11rem_6.5rem_minmax(0,1.5fr)_minmax(0,1fr)] gap-x-3 items-center py-1 border-t border-gray-100'

  return (
    <div className="w-full text-[13px]">
      <div className="grid grid-cols-[11rem_6.5rem_minmax(0,1.5fr)_minmax(0,1fr)] gap-x-3 items-center">
        <span className={head}>氏名</span><span className={head}>区分</span><span className={head}>住所1（都道府県〜番地まで）</span><span className={head}>住所2（建物名・部屋番号）</span>
      </div>
      {!hasClientHeir && client && (
        <div className={rowCls}>
          <span className="truncate text-gray-800 font-medium">{client.name || <span className="text-gray-300">依頼者（氏名未入力）</span>}</span>
          <span className="text-gray-600">依頼者</span>
          <input type="text" defaultValue={client.address ?? ''} onBlur={e => void saveClient('address', e.target.value.trim())} placeholder="住所1" className={inp} />
          <input type="text" defaultValue={client.address2 ?? ''} onBlur={e => void saveClient('address2', e.target.value.trim())} placeholder="住所2" className={inp} />
        </div>
      )}
      {alive.map(h => (
        <div key={h.id} className={rowCls}>
          <span className="truncate text-gray-800 font-medium" title={h.name}>{h.name}{h.relationship_type ? <span className="ml-1 text-[11.5px] text-gray-400">{h.relationship_type}</span> : null}</span>
          <select value={h.is_client ? '依頼者' : '相続人'} onChange={e => void saveHeir(h, { is_client: e.target.value === '依頼者' })} style={{ fontFamily: 'inherit' }} className="input-flat w-full px-1.5 py-1 text-[13px] text-gray-800 outline-none">
            {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input type="text" key={`a1-${h.id}-${h.address ?? ''}`} defaultValue={h.address ?? ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (h.address ?? '')) void saveHeir(h, { address: v || null }) }} placeholder="住所1" className={inp} />
          <input type="text" key={`a2-${h.id}-${h.address2 ?? ''}`} defaultValue={h.address2 ?? ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (h.address2 ?? '')) void saveHeir(h, { address2: v || null }) }} placeholder="住所2" className={inp} />
        </div>
      ))}
      {alive.length === 0 && (!client || hasClientHeir) && (
        <div className="py-2 text-gray-400">郵送先になる人がいません。相続人調査で相続人を入れるか、依頼者情報を入れてください</div>
      )}
      <div className="mt-1.5 text-[11.5px] text-gray-400">相続人調査の住所と同じものです。納品の受領先・封筒の宛先・原本受領証の郵送先はここから選びます。亡くなっている相続人は出しません。</div>
    </div>
  )
}
