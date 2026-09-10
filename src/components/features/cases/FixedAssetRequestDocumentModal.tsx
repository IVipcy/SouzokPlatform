'use client'

// 固定資産証明等申請書（名寄帳・評価証明）の出力画面。
//
// 戸籍の請求書と同じ「入力する場所」ではなく「確認して出す場所」。
// 紙に載る中身（提出先・年度・証明書の種類・所有者・対象物件・同封小為替・備考）は
// 財産調査タブの請求カード（real_estate_acquisitions）と、その市区町村の「判明した物件」（Step4 読込結果の物件一覧）の値。
// ここで直せてしまうと紙とカードが食い違うので、直すときはカードで直す。
//
// この画面で選ぶのは出し方だけ（様式・拠点・事業部・請求日・通数）。
// 対象物件は様式の都合で1枚5件まで。6件以上は自動で2枚目・3枚目に分けて出す。
//
// 入口は2つ。
//   ・請求カードの「この内容で申請書を作る」 … acquisition を渡す（1件）
//   ・書類作成メニュー … 渡さない。案件の役所ぶん（名寄帳・評価証明）の請求を読み、どれを出すか先頭で選ぶ

import { useEffect, useState } from 'react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import {
  FIXED_ASSET_VARIANT_PRESETS,
  defaultFixedAssetVariant,
  OFFICE_BRANCH_OPTIONS,
  divisionsOf,
  findBranch,
  IKIIKI_DEFAULT_BRANCH,
  type FixedAssetVariant,
  type OfficeBranchId,
} from '@/lib/officeProfiles'
import { isLandProperty, isBuildingProperty } from '@/lib/registrationTax'
import type { CaseRow, RealEstatePropertyRow, RealEstateAcquisitionRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  /** タスク詳細から作成する際に紐づけるタスクID */
  defaultTaskId?: string
  /** 請求カードから開いたとき：この請求の内容で出す */
  acquisition?: RealEstateAcquisitionRow | null
}

type Sheet = {
  landAddress: string
  buildingAddress: string
  kaokuBango: string
  needNeighborPrice: boolean
}

const PER_SHEET = 5
const toDigits = (s: string) => s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[^\d]/g, '')
/** 「神奈川県横浜市都筑区」→「横浜市都筑区」（紙の提出先は市区町村名から） */
const stripPref = (m: string) => m.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
/** 市区町村キー（RealEstateSection と同じ切り方。循環importを避けてここにも置く） */
const municipalityOf = (p: { municipality: string | null; address: string | null }): string => {
  const m = (p.municipality ?? '').trim()
  if (m) return m
  const a = (p.address ?? '').trim()
  const match = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
  return match ? `${match[1] ?? ''}${match[2]}` : ''
}
const itemsOf = (r: RealEstateAcquisitionRow): string[] => {
  const arr = r.item_types ?? []
  if (arr.length > 0) return arr
  return r.item_type ? [r.item_type] : []
}
/** 役所ぶん（名寄帳・評価証明）の請求か */
const isMuniRequest = (r: RealEstateAcquisitionRow) =>
  (r.scope === 'municipality' || (!r.scope && itemsOf(r).some(x => x === '名寄帳' || x.includes('評価証明'))))
  && itemsOf(r).some(x => x === '名寄帳' || x.includes('評価証明'))

export default function FixedAssetRequestDocumentModal({ isOpen, onClose, caseData, properties, defaultTaskId, acquisition = null }: Props) {
  const [variant, setVariant] = useState<FixedAssetVariant>(defaultFixedAssetVariant(caseData.contract_type))
  const [requestDate, setRequestDate] = useState<string>(new Date().toISOString().slice(0, 10))
  // 差出人の連絡先は 拠点＋事業部 で決まる（同じ拠点でも事業部で電話が変わる）
  const [officeId, setOfficeId] = useState<OfficeBranchId>(IKIIKI_DEFAULT_BRANCH.office)
  const [division, setDivision] = useState<string>(IKIIKI_DEFAULT_BRANCH.division)
  const branch = findBranch(officeId, division)
  const [copyCount, setCopyCount] = useState<number>(1)
  const [generating, setGenerating] = useState(false)
  // 書類作成メニューから開いたとき：案件の役所ぶんの請求を読んで、どれを出すか選ぶ
  const [candidates, setCandidates] = useState<RealEstateAcquisitionRow[]>([])
  const [pickId, setPickId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setVariant(defaultFixedAssetVariant(caseData.contract_type))
    setRequestDate(new Date().toISOString().slice(0, 10))
    setCopyCount(1)
    setPickId('')
  }, [isOpen, caseData.contract_type])

  useEffect(() => {
    if (!isOpen || acquisition) return
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data } = await createClient().from('real_estate_acquisitions').select('*').eq('case_id', caseData.id).order('sort_order')
      if (!alive) return
      const list = ((data ?? []) as RealEstateAcquisitionRow[]).filter(isMuniRequest)
      setCandidates(list)
      setPickId(list[0]?.id ?? '')
      setLoading(false)
    })()
    return () => { alive = false }
  }, [isOpen, acquisition, caseData.id])

  const k: RealEstateAcquisitionRow | null = acquisition ?? candidates.find(c => c.id === pickId) ?? null
  const preset = FIXED_ASSET_VARIANT_PRESETS[variant]

  // 紙に載る中身。すべてカードと物件一覧の値。
  const muniKey = (k?.target_municipality ?? '').trim()
  const muniProps = muniKey ? properties.filter(p => municipalityOf(p) === muniKey) : []
  const items = k ? itemsOf(k) : []
  const certKinds = [
    ...(items.includes('名寄帳') ? ['名寄帳'] : []),
    ...(items.some(x => x.includes('評価証明')) ? ['評価証明'] : []),
  ]
  const yearRaw = (k?.doc_year ?? k?.myna_year ?? '').trim()
  const doc = {
    municipality: stripPref(muniKey),
    nendo: yearRaw ? (yearRaw.endsWith('分') ? yearRaw : `${yearRaw}分`) : '',
    certKinds,
    ownerName: (caseData.deceased_name ?? '').trim(),
    ownerAddress: [caseData.deceased_address, caseData.deceased_address2].filter(Boolean).join('　'),
    kogawase: k?.cost_budget ?? null,
    notes: (k?.notes ?? '').trim(),
  }
  // 対象物件：土地は「所在＋地番」、建物は「所在」＋家屋番号。近傍宅地価格の要否は「判明した物件」の土地の列の値。
  const sheets: Sheet[] = muniProps.map(p => {
    const land = isLandProperty(p.property_type) || !p.property_type
    const building = isBuildingProperty(p.property_type)
    const addr = [p.address, land ? p.lot_number : null].filter(Boolean).join(' ')
    return {
      landAddress: land ? addr : '',
      buildingAddress: building ? (p.address ?? '') : '',
      kaokuBango: building ? (p.kaoku_bango ?? '') : '',
      needNeighborPrice: p.near_land_price === '要' || p.near_land_price === 'あり',
    }
  })
  const chunks: Sheet[][] = []
  for (let i = 0; i < sheets.length; i += PER_SHEET) chunks.push(sheets.slice(i, i + PER_SHEET))
  if (chunks.length === 0) chunks.push([])

  const handleGenerate = async () => {
    if (!k) { showToast('出力する請求がありません', 'error'); return }
    if (!doc.municipality) { showToast('請求カードの「対象」（市区町村）が空です', 'error'); return }
    if (!doc.ownerName) { showToast('被相続人の氏名が未入力です', 'error'); return }
    setGenerating(true)
    try {
      let made = 0
      for (let i = 0; i < chunks.length; i++) {
        const res = await fetch('/api/documents/fixed-asset-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: caseData.id,
            variant,
            requestDate,
            officeId,
            division,
            municipality: doc.municipality,
            nendo: doc.nendo,
            copyCount,
            certKinds: doc.certKinds,
            ownerName: doc.ownerName,
            ownerAddress: doc.ownerAddress,
            properties: chunks[i],
            kogawaseAmount: doc.kogawase,
            notes: doc.notes,
            taskId: defaultTaskId ?? null,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
          showToast(err.error ?? '生成に失敗しました', 'error')
          continue
        }
        const blob = await res.blob()
        const suffix = chunks.length > 1 ? `_${i + 1}` : ''
        const filename = `固定資産申請書_${caseData.case_number ?? ''}_${doc.municipality}${suffix}_${requestDate}.xlsx`
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        made += 1
      }
      if (made === 0) return
      showToast(made > 1 ? `固定資産申請書を${made}枚生成しました（物件が${PER_SHEET}件を超えるため分けています）` : '固定資産申請書を生成しました', 'success')
      onClose()
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const sel = 'w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400'
  const lab = 'block text-xs font-semibold text-gray-700 mb-1'
  const title = `固定資産証明等申請書 を作成${doc.municipality ? ` — ${doc.municipality}` : ''}`

  return (
    // 暗幕なしのフローティングウィンドウ（戸籍の請求書と同じ）。請求カードや物件一覧を見比べながら確認できる。
    <FloatingWindow isOpen={isOpen} onClose={onClose} title={title} width={768} height={600} resizable
      footer={
        <>
          <button onClick={onClose} disabled={generating}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">
            キャンセル
          </button>
          <button onClick={handleGenerate} disabled={generating || !k}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50">
            {generating ? '生成中…' : chunks.length > 1 ? `Excelで出力（${chunks.length}枚）` : 'Excelで出力'}
          </button>
        </>
      }>
      <div className="space-y-4">
        {/* 出し方だけここで選ぶ */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={lab}>様式バリエーション</label>
            <select value={variant} onChange={e => setVariant(e.target.value as FixedAssetVariant)} className={sel}>
              {(Object.keys(FIXED_ASSET_VARIANT_PRESETS) as FixedAssetVariant[]).map(key => (
                <option key={key} value={key}>{FIXED_ASSET_VARIANT_PRESETS[key].label}</option>
              ))}
            </select>
            <p className="text-[12px] text-gray-400 mt-1">契約形態：{caseData.contract_type ?? '未設定'}</p>
          </div>
          <div>
            <label className={lab}>拠点</label>
            <select value={officeId} onChange={e => { const next = e.target.value as OfficeBranchId; setOfficeId(next); setDivision(divisionsOf(next)[0] ?? '') }} className={sel}>
              {OFFICE_BRANCH_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lab}>事業部</label>
            <select value={division} onChange={e => setDivision(e.target.value)} className={sel}>
              {divisionsOf(officeId).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {branch && (
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                〒{branch.postalCode} {branch.line1} {branch.line2}<br />
                TEL {branch.tel} ／ FAX {branch.fax}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div>
              <label className={lab}>請求日</label>
              <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={sel} />
            </div>
            <div>
              <label className={lab}>通数</label>
              <input type="text" inputMode="numeric" value={copyCount ? String(copyCount) : ''}
                onChange={e => { const n = Number(toDigits(e.target.value)); setCopyCount(n > 0 ? n : 1) }}
                className={`${sel} text-right`} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">この内容で申請書を作成します</h3>
          {/* 書類作成メニューから開いたときだけ、どの請求を出すか選ぶ */}
          {!acquisition && (
            <div className="mb-2">
              <label className={lab}>どの請求を出しますか</label>
              {loading ? (
                <p className="text-[12px] text-gray-400">読み込み中…</p>
              ) : candidates.length === 0 ? (
                <p className="text-[12px] text-amber-700">役所への請求（名寄帳・評価証明）がまだありません。財産調査タブの市区町村ページで「＋ 請求を追加 → 役所へ」を作ってから出してください。</p>
              ) : (
                <select value={pickId} onChange={e => setPickId(e.target.value)} className={sel}>
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>
                      {[stripPref((c.target_municipality ?? '').trim()) || '市区町村未入力', itemsOf(c).join('・') || '資料未選択', c.doc_year ?? c.myna_year].filter(Boolean).join('／')}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {!k ? (
            <div className="px-3 py-6 text-center text-[12px] text-gray-400">出力する請求がありません</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <ConfRow label="提出先市区町村" value={doc.municipality} from="カード：対象" />
              <ConfRow label="年度" value={doc.nendo} from="カード：年度" />
              <ConfRow label="証明書の種類" value={doc.certKinds.join('・')} from="カード：取得する資料" />
              <ConfRow label="所有者" value={[doc.ownerName ? `故 ${doc.ownerName}` : '', doc.ownerAddress].filter(Boolean).join('　')} from="被相続人・最後の住所" />
              <ConfRow label="使用目的" value={preset.purpose} from="様式" />
              <ConfRow label="対象物件" from={`${muniKey || '市区町村'}の判明した物件（Step4 読込結果）`}
                value={sheets.length === 0 ? '' : sheets.map((sh, i) =>
                  `${i + 1}. ${[sh.landAddress ? `${sh.landAddress}（土地）` : '', sh.buildingAddress ? `${sh.buildingAddress}${sh.kaokuBango ? ` 家屋番号${sh.kaokuBango}` : ''}（建物）` : '', sh.needNeighborPrice ? '近傍宅地価格 要' : ''].filter(Boolean).join('　')}`
                ).join('\n')} />
              <ConfRow label="同封小為替" value={doc.kogawase == null ? '' : `¥${doc.kogawase.toLocaleString('ja-JP')}`} from="カード：同封する小為替" />
              <ConfRow label="備考" value={doc.notes} from="カード：備考" optional last />
            </div>
          )}
          {sheets.length > PER_SHEET && (
            <p className="text-[12px] text-amber-700 mt-2">物件が{sheets.length}件あるため、{PER_SHEET}件ずつ{chunks.length}枚に分けて出力します。</p>
          )}
          <p className="text-[12px] text-gray-500 mt-2">値は請求カード・物件一覧のものです。直すときはそちらで直してください。内容に問題なければ、Excelで出力ボタンを押下してください。</p>
        </section>
      </div>
    </FloatingWindow>
  )
}

/** 確認行。空欄は赤く「未入力」（任意の欄は「—」）。どこの値かを右に小さく出す */
function ConfRow({ label, value, from, optional = false, last = false }: { label: string; value: string; from?: string; optional?: boolean; last?: boolean }) {
  const empty = !value.trim()
  return (
    <div className={`grid grid-cols-[9rem_minmax(0,1fr)] ${last ? '' : 'border-b border-gray-100'}`}>
      <div className="px-3 py-2 text-[12px] font-semibold text-gray-500 bg-gray-50">{label}</div>
      <div className="px-3 py-2 text-[13px] flex items-start gap-2">
        <span className={`whitespace-pre-line min-w-0 flex-1 ${empty ? (optional ? 'text-gray-300' : 'text-red-600 font-semibold') : 'text-gray-800'}`}>{empty ? (optional ? '—' : '未入力') : value}</span>
        {from && <span className="flex-none text-[10.5px] text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">{from}</span>}
      </div>
    </div>
  )
}
