'use client'

// 登記部門へ依頼を出すポップアップ。
//   相続登記タブから … 案件は決まっている（caseId）。法務局は開いているページのものが既定
//   マイページから   … 先頭で案件を選ぶ（自分が管理担当の案件）
// 出すと touki_requests に1行入り、相続登記チーム全員に通知。

import { useEffect, useState } from 'react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { TOUKI_REQUEST_TYPES, TOUKI_REQUEST_TYPE_NOTE, notifyToukiTeamNewRequest } from '@/lib/toukiRequests'
import { REGISTRATION_TYPES } from '@/lib/constants'
import type { RealEstatePropertyRow, ToukiRequestRow, ToukiRequestType } from '@/types'

type CaseLite = { id: string; case_number: string; deal_name: string }

export default function ToukiRequestModal({ isOpen, onClose, caseId, cases, properties, defaultOffice, defaultType, parent, onSaved }: {
  isOpen: boolean
  onClose: () => void
  /** 案件が決まっているとき */
  caseId?: string
  /** マイページから：選べる案件（自分が管理担当のもの） */
  cases?: CaseLite[]
  /** 案件の物件（法務局・登記の種類・対象物件の候補）。caseId が無いときは案件を選んだあとに読む */
  properties?: RealEstatePropertyRow[]
  defaultOffice?: string | null
  /** 操作バーのボタンから開いたときの種別（再依頼が無いとき） */
  defaultType?: ToukiRequestType | null
  /** 再依頼のとき：元の依頼（種別・法務局・物件を引き継ぐ） */
  parent?: ToukiRequestRow | null
  onSaved?: () => void
}) {
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const [pickedCase, setPickedCase] = useState<string>(caseId ?? '')
  const [props, setProps] = useState<RealEstatePropertyRow[]>(properties ?? [])
  const [type, setType] = useState<ToukiRequestType>(parent?.request_type ?? defaultType ?? '作成願い')
  const [office, setOffice] = useState(parent?.office ?? defaultOffice ?? '')
  const [regType, setRegType] = useState(parent?.registration_type ?? '相続')
  // 物件の既定：元の依頼があればそれ、無ければこの法務局の物件全部。
  // このモーダルは開くたびに作り直される（親が open のときだけ描く）ので、初期値で決めてよい。
  const [propIds, setPropIds] = useState<string[]>(() => {
    const base = properties ?? []
    const off = (parent?.office ?? defaultOffice ?? '').trim()
    return parent?.property_ids ?? (off ? base.filter(p => (p.registration_office ?? '').trim() === off).map(p => p.id) : [])
  })
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // マイページから：案件を選んだら物件を読む
  useEffect(() => {
    if (!isOpen || caseId || !pickedCase) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('real_estate_properties').select('*').eq('case_id', pickedCase).order('sort_order')
      if (!alive) return
      const list = (data ?? []) as RealEstatePropertyRow[]
      setProps(list)
      const offices = [...new Set(list.map(p => (p.registration_office ?? '').trim()).filter(Boolean))]
      const off = offices[0] ?? ''
      setOffice(off)
      setPropIds(off ? list.filter(p => (p.registration_office ?? '').trim() === off).map(p => p.id) : [])
    })()
    return () => { alive = false }
  }, [isOpen, caseId, pickedCase, supabase])

  const offices = [...new Set(props.map(p => (p.registration_office ?? '').trim()).filter(Boolean))]
  const officeProps = office ? props.filter(p => (p.registration_office ?? '').trim() === office) : props
  const propLabel = (p: RealEstatePropertyRow) => {
    const isBldg = ['建物', 'マンション', '区分建物'].some(k => (p.property_type ?? '').includes(k))
    const s = [p.address, isBldg ? (p.kaoku_bango ? `家屋番号 ${p.kaoku_bango}` : '') : p.lot_number, p.property_type ? `（${p.property_type}）` : ''].filter(Boolean).join(' ')
    return s || '所在未入力の物件'
  }

  const submit = async () => {
    const cid = caseId ?? pickedCase
    if (!cid) { showToast('案件を選んでください', 'error'); return }
    if (!memberId) { showToast('ログイン情報が取得できませんでした', 'error'); return }
    setSaving(true)
    const { data, error } = await supabase.from('touki_requests').insert({
      case_id: cid, request_type: type, office: office.trim() || null, registration_type: regType || null,
      property_ids: propIds.length > 0 ? propIds : null, note: note.trim() || null,
      requester_id: memberId, status: '依頼中', parent_id: parent?.id ?? null,
    }).select('id, case_id, request_type, office, note').single()
    if (error || !data) { setSaving(false); showToast(`依頼に失敗: ${error?.message ?? ''}`, 'error'); return }
    const { data: me } = await supabase.from('members').select('name').eq('id', memberId).maybeSingle()
    await notifyToukiTeamNewRequest(supabase, data as { id: string; case_id: string; request_type: string; office: string | null; note: string | null }, (me as { name?: string } | null)?.name ?? null)
    setSaving(false)
    showToast(`${type}を登記部門へ出しました（相続登記チームに通知）`, 'success')
    onSaved?.()
    onClose()
  }

  const inp = 'w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white'
  const lab = 'block text-[12px] font-semibold text-gray-500 mb-1'

  return (
    // 暗幕なしのフローティングウィンドウ（報連相・タスク追加と同じ）。相続登記タブを見ながら書ける
    <FloatingWindow isOpen={isOpen} onClose={onClose} title={parent ? '直して再依頼する' : '登記部門へ依頼を出す'} width={560} height={520} resizable fitContent
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
        <Button variant="primary" onClick={submit} loading={saving} disabled={!(caseId ?? pickedCase)}>{parent ? '再依頼する' : '依頼する'}</Button>
      </>}>
      <div className="space-y-3.5">
        {!caseId && (
          <div>
            <label className={lab}>案件</label>
            <select value={pickedCase} onChange={e => setPickedCase(e.target.value)} className={inp}>
              <option value="">— 案件を選ぶ —</option>
              {(cases ?? []).map(c => <option key={c.id} value={c.id}>{c.case_number}　{c.deal_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={lab}>依頼の種別</label>
          <div className="flex flex-wrap gap-1.5">
            {TOUKI_REQUEST_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setType(t)} disabled={!!parent}
                className={`px-3 py-1.5 rounded-lg border text-[12.5px] font-semibold transition-colors ${type === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'} disabled:opacity-60`}>
                {t}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11.5px] text-gray-400">{TOUKI_REQUEST_TYPE_NOTE[type]}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lab}>法務局</label>
            <input list="touki-office-list" value={office} onChange={e => setOffice(e.target.value)} placeholder="例: 横浜地方法務局" className={inp} />
            {offices.length > 0 && <datalist id="touki-office-list">{offices.map(o => <option key={o} value={o} />)}</datalist>}
          </div>
          <div>
            <label className={lab}>登記の種類</label>
            <select value={regType} onChange={e => setRegType(e.target.value)} className={inp}>
              {[...new Set(['相続', ...REGISTRATION_TYPES])].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lab}>対象物件{office ? `（${office}の物件）` : ''}</label>
          {officeProps.length === 0 ? (
            <p className="text-[12px] text-gray-400">この法務局の物件がありません（財産調査タブで物件に管轄法務局を入れると出ます）。物件なしで依頼できます。</p>
          ) : (
            <div className="space-y-1">
              {officeProps.map(p => {
                const on = propIds.includes(p.id)
                return (
                  <label key={p.id} className="flex items-center gap-2 text-[12.5px] text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => setPropIds(prev => (on ? prev.filter(x => x !== p.id) : [...prev, p.id]))} className="w-4 h-4 accent-brand-600" />
                    <span>{propLabel(p)}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <div>
          <label className={lab}>一言（任意）</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="例：委任状も相続の力に入れてあります" className={`${inp} resize-none`} />
        </div>
        <p className="text-[11.5px] text-gray-400">相続登記チーム全員に通知します。依頼中のまま1営業日で要確認、3営業日で要注意になります。</p>
      </div>
    </FloatingWindow>
  )
}
