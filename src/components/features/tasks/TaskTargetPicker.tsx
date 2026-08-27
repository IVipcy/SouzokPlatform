'use client'

// タスクを手で足すときの「対象」欄。
//
// 一括生成をやめて随時タスクを足す運用にすると、そのままでは source_rid が空になり、
// 実務タブの該当行へ飛べなくなる。ここで対象を選ばせて source_rid を作る。
//
// 業務ごとにキーの作り方が違う：
//   戸籍   … koseki:{koseki_requests の行ID}。同じ人・同じ役所でも請求のたびに別行なので、
//             既存行から選ばせず、請求先と対象者を入力して常に新しい行を作る。
//   不動産 … re-muni:{市区町村}   ＝ 名前がそのままキー。行は作らない
//   金融   … fin:{金融機関名}     ＝ 同上
//   解約   … cancel:{金融機関名}  ＝ 同上
// 対象は任意。空のまま追加してよく、後からタスク詳細で選び直せる。

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** 対象欄を出す業務。ここに無い業務では何も出さない。 */
export const TARGET_GYOMU = ['戸籍', '不動産', '金融資産', '解約'] as const

/** 業務名から source_rid の接頭辞を引く（戸籍は行を作るのでここには入れない） */
const PREFIX: Record<string, string> = { '不動産': 're-muni', '金融資産': 'fin', '解約': 'cancel' }

export type TaskTarget =
  | { kind: 'none' }
  /** 戸籍：保存時に koseki_requests を作ってから source_rid を組む */
  | { kind: 'koseki'; requestTo: string; targetPerson: string }
  /** 名前がそのままキーになる業務 */
  | { kind: 'name'; prefix: string; name: string }

export const emptyTarget = (): TaskTarget => ({ kind: 'none' })

/**
 * 選んだ対象から source_rid を作る。
 * 戸籍だけは実務タブの行を新しく作る副作用があるので、保存時にこれを呼ぶ。
 * 対象なし・入力が空なら null（紐づけないタスクとして作る）。
 */
export async function resolveTargetRid(caseId: string, target: TaskTarget): Promise<string | null> {
  if (target.kind === 'name') {
    const name = target.name.trim()
    return name ? `${target.prefix}:${name}` : null
  }
  if (target.kind === 'koseki') {
    const requestTo = target.requestTo.trim()
    const person = target.targetPerson.trim()
    if (!requestTo && !person) return null
    const { data, error } = await createClient()
      .from('koseki_requests')
      .insert({ case_id: caseId, request_to: requestTo || null, target_person: person || null })
      .select('id')
      .single()
    if (error || !data) return null
    return `koseki:${(data as { id: string }).id}`
  }
  return null
}

export default function TaskTargetPicker({ caseId, gyomu, value, onChange, compact = false }: {
  caseId: string
  gyomu: string
  value: TaskTarget
  onChange: (v: TaskTarget) => void
  compact?: boolean
}) {
  // 不動産＝この案件の物件の市区町村／金融・解約＝この案件の金融機関
  const [names, setNames] = useState<string[]>([])
  // 相続人・被相続人の氏名（戸籍の対象者の候補）
  const [people, setPeople] = useState<string[]>([])

  const prefix = PREFIX[gyomu]
  const isKoseki = gyomu === '戸籍'
  const active = isKoseki || !!prefix

  useEffect(() => {
    if (!active) return
    let alive = true
    ;(async () => {
      const supabase = createClient()
      if (isKoseki) {
        const [cs, hs] = await Promise.all([
          supabase.from('cases').select('deceased_name').eq('id', caseId).single(),
          supabase.from('heirs').select('name').eq('case_id', caseId).order('created_at').order('id'),
        ])
        if (!alive) return
        const dn = (cs.data as { deceased_name: string | null } | null)?.deceased_name?.trim()
        const hn = ((hs.data ?? []) as Array<{ name: string }>).map(h => h.name.trim()).filter(Boolean)
        setPeople([...new Set([dn, ...hn].filter((v): v is string => !!v))])
        return
      }
      if (gyomu === '不動産') {
        const { data } = await supabase.from('real_estate_properties').select('municipality, address').eq('case_id', caseId)
        if (!alive) return
        const muniOf = (p: { municipality: string | null; address: string | null }) => {
          const m = (p.municipality ?? '').trim()
          if (m) return m
          const a = (p.address ?? '').trim()
          const match = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
          return match ? `${match[1] ?? ''}${match[2]}` : ''
        }
        setNames([...new Set(((data ?? []) as Array<{ municipality: string | null; address: string | null }>).map(muniOf).filter(Boolean))])
        return
      }
      const { data } = await supabase.from('financial_assets').select('institution_name').eq('case_id', caseId)
      if (!alive) return
      setNames([...new Set(((data ?? []) as Array<{ institution_name: string | null }>).map(a => (a.institution_name ?? '').trim()).filter(Boolean))])
    })()
    return () => { alive = false }
  }, [caseId, gyomu, isKoseki, active])

  if (!active) return null

  const label = `block ${compact ? 'text-[11.5px]' : 'text-[13px]'} font-semibold text-gray-500 mb-1`
  const inp = `w-full px-3 py-2 border border-gray-300 rounded-lg ${compact ? 'text-[12.5px]' : 'text-sm'} focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none`
  const hint = 'mt-1 text-[11px] text-gray-400'

  if (isKoseki) {
    const v = value.kind === 'koseki' ? value : { requestTo: '', targetPerson: '' }
    const set = (p: Partial<{ requestTo: string; targetPerson: string }>) =>
      onChange({ kind: 'koseki', requestTo: v.requestTo, targetPerson: v.targetPerson, ...p })
    return (
      <div>
        <label className={label}>対象の戸籍請求</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={v.requestTo}
            onChange={e => set({ requestTo: e.target.value })}
            placeholder="請求先（例：越谷市）"
            className={inp}
          />
          <input
            type="text"
            list="koseki-people"
            value={v.targetPerson}
            onChange={e => set({ targetPerson: e.target.value })}
            placeholder="対象者（誰の戸籍か）"
            className={inp}
          />
          <datalist id="koseki-people">{people.map(p => <option key={p} value={p} />)}</datalist>
        </div>
        <p className={hint}>
          入れると実務タブ＞戸籍請求に新しい行ができ、このタスクからその行へ直接飛べます。
          同じ人・同じ役所でも請求のたびに別の行になります。空のままでも追加できます。
        </p>
      </div>
    )
  }

  const v = value.kind === 'name' ? value.name : ''
  const listId = `task-target-${gyomu}`
  return (
    <div>
      <label className={label}>{gyomu === '不動産' ? '対象の市区町村' : '対象の金融機関'}</label>
      <input
        type="text"
        list={listId}
        value={v}
        onChange={e => onChange({ kind: 'name', prefix: prefix!, name: e.target.value })}
        placeholder={gyomu === '不動産' ? '例：横浜市都筑区' : '例：みずほ銀行'}
        className={inp}
      />
      <datalist id={listId}>{names.map(n => <option key={n} value={n} />)}</datalist>
      <p className={hint}>
        {names.length > 0
          ? 'この案件に登録されているものから選べます（手入力も可）。入れると実務タブの該当箇所へ直接飛べます。空のままでも追加できます。'
          : '入れると実務タブの該当箇所へ直接飛べます。空のままでも追加できます。'}
      </p>
    </div>
  )
}
