'use client'

// 登記情報（txt）の取り込み。法務局カード Step4「判明した物件」の上のボタンから開く。
//   1. txt を複数選ぶ（Shift-JIS。リーガル等の「最新の記載事項」）
//   2. 読んだ結果を一覧で見せる。判明した物件と 所在＋地番／家屋番号（または不動産番号）で突き合わせ、
//      「既存に反映」か「新規追加」。所有者に被相続人の名前が無い物件は既定で外す
//   3. 取り込む：物件を作る／更新する。元の txt は案件フォルダへ保存。この市区町村の法務局カードの
//      「登記情報」到着日が空なら今日を入れる（チェックで外せる）
// 読み取りは lib/toukiTxt.ts（OCR・AI は使わない）。

import { useMemo, useRef, useState } from 'react'
import { Upload, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { uploadFilesToCaseFolder } from '@/lib/caseFolder'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { todayJstYmd } from '@/lib/today'
import { decodeToukiTxt, parseToukiTxt, deceasedShare, normKey, normName, municipalityFromAddress, type ParsedTouki } from '@/lib/toukiTxt'
import type { RealEstatePropertyRow } from '@/types'

type Judge = 'update' | 'new' | 'shared' | 'other_owner' | 'error'
type Item = {
  id: string
  file: File
  parsed: ParsedTouki
  existing: RealEstatePropertyRow | null
  share: { num: number; den: number } | null
  judge: Judge
  on: boolean
  /** 既存と違う値（項目名：旧→新） */
  diffs: string[]
}

const JUDGE_TAG: Record<Judge, { label: string; cls: string }> = {
  update: { label: '既存に反映', cls: 'bg-blue-50 text-blue-700' },
  new: { label: '新規追加', cls: 'bg-emerald-50 text-emerald-700' },
  shared: { label: '共有', cls: 'bg-amber-50 text-amber-800' },
  other_owner: { label: '所有者が違う', cls: 'bg-red-50 text-red-700' },
  error: { label: '読めない', cls: 'bg-red-50 text-red-700' },
}

const shareText = (s: { num: number; den: number } | null) => (s ? (s.num === s.den ? '1/1' : `${s.num}/${s.den}`) : '')

export default function ToukiTxtImportModal({ caseId, municipality, properties, deceasedName, onClose, onDone }: {
  caseId: string
  /** 開いている市区町村タブ（新規の物件はここに入れる） */
  municipality: string | null
  /** 案件の物件（全部。突き合わせに使う） */
  properties: RealEstatePropertyRow[]
  deceasedName: string | null
  onClose: () => void
  onDone: () => void
}) {
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markArrival, setMarkArrival] = useState(true)
  const [saveFiles, setSaveFiles] = useState(true)

  /** 既存の物件との突き合わせ（不動産番号 → 所在＋番号） */
  const findExisting = (p: ParsedTouki): RealEstatePropertyRow | null => {
    if (p.propertyNumber) {
      const byNo = properties.find(r => normKey(r.property_number) === normKey(p.propertyNumber))
      if (byNo) return byNo
    }
    const num = normKey(p.kind === '土地' ? p.lotNumber : p.kaokuBango)
    if (!num) return null
    const addr = normKey(p.address)
    const cands = properties.filter(r => {
      const isLand = (r.property_type ?? '') !== '建物'
      if ((p.kind === '土地') !== isLand) return false
      const rn = normKey(isLand ? r.lot_number : r.kaoku_bango)
      if (!rn || rn !== num) return false
      const ra = normKey(r.address)
      return !ra || !addr || ra === addr || ra.includes(addr) || addr.includes(ra)
    })
    return cands[0] ?? null
  }

  const read = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setReading(true)
    const next: Item[] = []
    for (const f of Array.from(files)) {
      const text = decodeToukiTxt(await f.arrayBuffer())
      const parsed = parseToukiTxt(text, f.name)
      const existing = findExisting(parsed)
      const share = deceasedShare(parsed.owners, deceasedName)
      const fatal = !parsed.address || (parsed.kind === '土地' ? !parsed.lotNumber : !parsed.kaokuBango)
      let judge: Judge = existing ? 'update' : 'new'
      if (fatal) judge = 'error'
      else if (parsed.owners.length > 0 && !share) judge = 'other_owner'
      else if (share && parsed.owners.length > 1) judge = 'shared'
      const diffs: string[] = []
      if (existing) {
        const d = (label: string, oldV: string | number | null | undefined, newV: string | number | null | undefined) => {
          const o = String(oldV ?? '').trim(), n = String(newV ?? '').trim()
          if (o && n && normKey(o) !== normKey(n)) diffs.push(`${label}：${o} → ${n}`)
        }
        d('所在', existing.address, parsed.address)
        if (parsed.kind === '土地') { d('地目', existing.land_category, parsed.landCategory); d('地積', existing.land_area, parsed.landArea) }
        else { d('種類', existing.building_kind, parsed.buildingKind); d('構造', existing.building_structure, parsed.structure); d('床面積', existing.floor_area, parsed.floorArea) }
        if (share) d('持分', existing.share_numerator != null && existing.share_denominator != null ? `${existing.share_numerator}/${existing.share_denominator}` : '', shareText(share) === '1/1' ? '' : shareText(share))
      }
      next.push({ id: crypto.randomUUID(), file: f, parsed, existing, share, judge, on: judge !== 'other_owner' && judge !== 'error', diffs })
    }
    setItems(prev => [...prev, ...next])
    setReading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const picked = useMemo(() => items.filter(i => i.on && i.judge !== 'error'), [items])

  const apply = async () => {
    if (picked.length === 0 || saving) return
    setSaving(true)
    const now = new Date().toISOString()
    const today = todayJstYmd()
    let ok = 0
    // 今回取り込んだ物件のID（到着日を入れる法務局カードをこの物件のものだけに絞る）
    const touchedPropertyIds: string[] = []
    for (const it of picked) {
      const p = it.parsed
      const others = p.owners.filter(o => normName(o.name) !== normName(deceasedName))
      const patch: Record<string, unknown> = {
        // 種別は既存物件に入っていれば残す（「マンション」を「建物」で潰していた）
        ...(it.existing?.property_type ? {} : { property_type: p.kind }),
        address: p.address || null,
        property_number: p.propertyNumber || null,
        registry_imported_at: now,
        co_owners: others.length > 0 ? others.map(o => `${o.address} ${o.name} ${o.num}/${o.den}`).join('\n') : null,
      }
      if (p.kind === '土地') { patch.lot_number = p.lotNumber || null; if (p.landCategory) patch.land_category = p.landCategory; if (p.landArea != null) patch.land_area = p.landArea }
      else { patch.kaoku_bango = p.kaokuBango || null; if (p.buildingKind) patch.building_kind = p.buildingKind; if (p.structure) patch.building_structure = p.structure; if (p.floorArea) patch.floor_area = p.floorArea }
      // 持分：被相続人のぶんだけ。1/1 は「未入力＝全部」の決まりに合わせて空にする
      if (it.share) { const full = it.share.num === it.share.den; patch.share_numerator = full ? null : it.share.num; patch.share_denominator = full ? null : it.share.den }
      if (p.mortgages.length > 0) patch.mortgage = p.mortgages.join('／')
      if (p.registryOffice && !(it.existing?.registration_office ?? '').trim()) patch.registration_office = p.registryOffice
      if (p.isCondo) patch.is_condo_land = true
      if (it.existing) {
        if (!(it.existing.municipality ?? '').trim()) patch.municipality = municipality || municipalityFromAddress(p.address) || null
        const { error } = await supabase.from('real_estate_properties').update(patch).eq('id', it.existing.id)
        if (error) { showToast(`${p.fileName} の反映に失敗: ${error.message}`, 'error'); continue }
        touchedPropertyIds.push(it.existing.id)
      } else {
        const muni = municipality || municipalityFromAddress(p.address) || null
        const { data, error } = await supabase.from('real_estate_properties').insert({ case_id: caseId, municipality: muni, ...patch }).select('id').single()
        if (error || !data) { showToast(`${p.fileName} の追加に失敗: ${error?.message ?? ''}`, 'error'); continue }
        // 物件ごとの法務局カード（登記情報・公図・地積測量図）。手で足したときと同じ
        await supabase.from('real_estate_acquisitions').insert({
          case_id: caseId, scope: 'property', target_property_id: (data as { id: string }).id, target_municipality: muni,
          item_type: '登記情報', item_types: ['登記情報', '公図', '地積測量図'], request_to: p.registryOffice || '法務局', sort_order: 0,
          ...(markArrival ? { arrival_date: today, receipt_done_by: memberId } : {}),
        })
      }
      ok++
    }
    // 今回取り込んだ物件の法務局カードで「登記情報」が入っていて到着日が空のものに今日を入れる
    // （同じ市区町村の無関係な物件のカードにまで到着日が入っていた）
    if (markArrival && touchedPropertyIds.length > 0) {
      const { data: cards } = await supabase.from('real_estate_acquisitions').select('id, item_types, item_type, arrival_date')
        .eq('case_id', caseId).eq('scope', 'property').in('target_property_id', touchedPropertyIds).is('arrival_date', null)
      const ids = ((cards ?? []) as Array<{ id: string; item_types: string[] | null; item_type: string | null }>)
        .filter(c => (c.item_types ?? [c.item_type ?? '']).includes('登記情報')).map(c => c.id)
      if (ids.length > 0) await supabase.from('real_estate_acquisitions').update({ arrival_date: today, receipt_done_by: memberId }).in('id', ids)
    }
    if (saveFiles) {
      const r = await uploadFilesToCaseFolder(caseId, picked.map(i => i.file), memberId)
      if (r.failed > 0) showToast(`txt の保存に ${r.failed} 件失敗しました（物件は入っています）`, 'error')
    }
    setSaving(false)
    showToast(`${ok} 件の物件を取り込みました`, 'success')
    onDone()
    onClose()
  }

  const numText = (p: ParsedTouki) => (p.kind === '土地' ? `地番 ${p.lotNumber || '—'}` : `家屋番号 ${p.kaokuBango || '—'}`)
  const spec = (p: ParsedTouki) => p.kind === '土地'
    ? [p.landCategory, p.landArea != null ? `${p.landArea}㎡` : ''].filter(Boolean).join('・')
    : [p.buildingKind, p.structure, p.floorArea ? `${p.floorArea}㎡` : ''].filter(Boolean).join('・')

  return (
    <Modal isOpen onClose={onClose} title="登記情報（txt）を取り込む" maxWidth="max-w-6xl"
      footer={
        <div className="flex items-center gap-3 w-full flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-700 cursor-pointer"><input type="checkbox" checked={markArrival} onChange={e => setMarkArrival(e.target.checked)} className="w-4 h-4 accent-brand-600" />法務局カードの「登記情報」の到着日を今日にする</label>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-700 cursor-pointer"><input type="checkbox" checked={saveFiles} onChange={e => setSaveFiles(e.target.checked)} className="w-4 h-4 accent-brand-600" />txt を案件フォルダに保存する</label>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose} disabled={saving}>やめる</Button>
          <Button variant="primary" onClick={() => void apply()} loading={saving} disabled={picked.length === 0}>この内容で取り込む（{picked.length}件）</Button>
        </div>
      }>
      <div className="space-y-3 text-[13px]">
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".txt,text/plain" multiple className="hidden" onChange={e => void read(e.target.files)} />
          <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} loading={reading}><Upload className="w-3.5 h-3.5" />txt を選ぶ（複数可）</Button>
          <span className="text-[11.5px] text-gray-500">リーガル等の「最新の記載事項」txt（Shift-JIS）。現在の事項だけなので OCR も AI も使いません。所在＋地番／家屋番号（または不動産番号）で判明した物件と突き合わせます。{deceasedName ? `所有者は被相続人「${deceasedName}」と照合します。` : '被相続人名が未入力なので所有者の照合はできません。'}</span>
        </div>

        {items.length > 0 && (
          <div className="border border-gray-200 overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2 text-left">ファイル</th>
                  <th className="px-2 py-2 text-left w-14">種別</th>
                  <th className="px-2 py-2 text-left">所在／番号</th>
                  <th className="px-2 py-2 text-left">登記の内容</th>
                  <th className="px-2 py-2 text-left">所有者（登記）</th>
                  <th className="px-2 py-2 text-left w-28">判定</th>
                  <th className="px-2 py-2 text-left">どうするか</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const p = it.parsed, tag = JUDGE_TAG[it.judge]
                  return (
                    <tr key={it.id} className={`border-t border-gray-100 align-top ${it.on ? '' : 'opacity-60'}`}>
                      <td className="px-2 py-2"><input type="checkbox" checked={it.on} disabled={it.judge === 'error'} onChange={e => setItems(prev => prev.map(x => (x.id === it.id ? { ...x, on: e.target.checked } : x)))} className="w-4 h-4 accent-brand-600" /></td>
                      <td className="px-2 py-2 font-mono text-[11.5px] text-gray-600 max-w-[10rem] truncate" title={p.fileName}>{p.fileName}</td>
                      <td className="px-2 py-2">{p.kind}</td>
                      <td className="px-2 py-2 text-gray-800">{p.address || <span className="text-red-600">所在なし</span>}<div className="font-mono text-[12px] text-gray-600">{numText(p)}{p.propertyNumber && <span className="ml-2 text-gray-400">No.{p.propertyNumber}</span>}</div></td>
                      <td className="px-2 py-2 text-gray-700">{spec(p) || '—'}{p.mortgages.length > 0 && <div className="text-[11.5px] text-amber-800">乙区：{p.mortgages.join('／')}</div>}{p.registryOffice && <div className="text-[11px] text-gray-400">{p.registryOffice}</div>}</td>
                      <td className="px-2 py-2 text-gray-700">
                        {p.owners.length === 0 ? <span className="text-red-600">読めません</span> : p.owners.map((o, i) => (
                          <div key={i} className={normName(o.name) === normName(deceasedName) ? 'font-semibold text-gray-900' : ''}>{o.name} <span className="font-mono text-[11.5px]">{o.num}/{o.den}</span><span className="ml-1 text-[11px] text-gray-400">{o.address}</span></div>
                        ))}
                      </td>
                      <td className="px-2 py-2"><span className={`inline-block text-[11px] font-bold px-1.5 py-0.5 ${tag.cls}`}>{tag.label}</span></td>
                      <td className="px-2 py-2 text-[12px] text-gray-700 leading-relaxed">
                        {it.judge === 'error' && <>{p.warnings.join('。')}</>}
                        {it.judge === 'other_owner' && <>被相続人の名前が所有者にありません（移転済み・別人）。取り込むなら ☑ にしてください。持分は入れません</>}
                        {it.judge === 'shared' && <>被相続人の持分 <span className="font-mono">{shareText(it.share)}</span> だけを入れます。ほかの共有者は「共有者」欄に残します</>}
                        {(it.judge === 'update' || it.judge === 'new') && (it.existing
                          ? <>{it.existing.address || '（所在未入力）'} の行を更新します{it.share && <>（持分 <span className="font-mono">{shareText(it.share)}</span>）</>}</>
                          : <>判明した物件に足します{it.share && <>（持分 <span className="font-mono">{shareText(it.share)}</span>）</>}。評価額は空のままです</>)}
                        {it.existing && it.diffs.length > 0 && <div className="mt-0.5">{it.diffs.map((d, i) => <span key={i} className="inline-block bg-amber-100 text-amber-900 px-1 mr-1 mb-0.5">{d}</span>)}</div>}
                        {it.judge !== 'error' && p.warnings.length > 0 && <div className="mt-0.5 text-amber-800 inline-flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-none mt-0.5" />{p.warnings.join('。')}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {items.length === 0 && !reading && (
          <div className="border border-dashed border-gray-300 px-4 py-8 text-center text-[12.5px] text-gray-400">txt を選ぶと、読んだ内容がここに並びます。取り込む前に確認できます</div>
        )}
      </div>
    </Modal>
  )
}
