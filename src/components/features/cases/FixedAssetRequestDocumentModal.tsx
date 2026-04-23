'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  FIXED_ASSET_VARIANT_PRESETS,
  defaultFixedAssetVariant,
  type FixedAssetVariant,
} from '@/lib/officeProfiles'
import type { CaseRow, RealEstatePropertyRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
}

type PropertyRow = {
  id: string
  landAddress: string
  buildingAddress: string
  kaokuBango: string
  needNeighborPrice: boolean
}

const CERT_KINDS = ['名寄帳', '評価証明', '非課税証明書'] as const

function createPropertyRow(partial: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    landAddress: '',
    buildingAddress: '',
    kaokuBango: '',
    needNeighborPrice: false,
    ...partial,
  }
}

function toLandAddr(p: RealEstatePropertyRow): string {
  const parts = [p.address, p.lot_number].filter(Boolean).join(' ')
  return parts
}

export default function FixedAssetRequestDocumentModal({ isOpen, onClose, caseData, properties }: Props) {
  const [variant, setVariant] = useState<FixedAssetVariant>(defaultFixedAssetVariant(caseData.contract_type))
  const [requestDate, setRequestDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [municipality, setMunicipality] = useState('')
  const [nendo, setNendo] = useState('令和7年度分')
  const [copyCount, setCopyCount] = useState<number>(1)
  const [certKinds, setCertKinds] = useState<string[]>(['名寄帳', '評価証明'])
  const [ownerName, setOwnerName] = useState('')
  const [ownerAddress, setOwnerAddress] = useState('')
  const [rows, setRows] = useState<PropertyRow[]>([])
  const [kogawaseAmount, setKogawaseAmount] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setVariant(defaultFixedAssetVariant(caseData.contract_type))
    setRequestDate(new Date().toISOString().slice(0, 10))
    setMunicipality('')
    setNendo('令和7年度分')
    setCopyCount(1)
    setCertKinds(['名寄帳', '評価証明'])
    setOwnerName(caseData.deceased_name ?? '')
    setOwnerAddress(caseData.deceased_address ?? '')
    setKogawaseAmount('')
    setNotes('')
    // 物件リストを初期ロード（最大5件）
    if (properties.length > 0) {
      setRows(properties.slice(0, 5).map(p => createPropertyRow({
        landAddress: toLandAddr(p),
        buildingAddress: toLandAddr(p),
        kaokuBango: '',
      })))
    } else {
      setRows([createPropertyRow()])
    }
  }, [isOpen, caseData.contract_type, caseData.deceased_name, caseData.deceased_address, properties])

  const preset = FIXED_ASSET_VARIANT_PRESETS[variant]

  const addRow = () => {
    if (rows.length >= 5) {
      showToast('物件は最大5件まで登録できます', 'error')
      return
    }
    setRows(r => [...r, createPropertyRow()])
  }

  const updateRow = (id: string, patch: Partial<PropertyRow>) =>
    setRows(r => r.map(row => row.id === id ? { ...row, ...patch } : row))

  const deleteRow = (id: string) =>
    setRows(r => r.filter(row => row.id !== id))

  const toggleCertKind = (kind: string) => {
    setCertKinds(c => c.includes(kind) ? c.filter(k => k !== kind) : [...c, kind])
  }

  const handleGenerate = async () => {
    if (!municipality.trim()) {
      showToast('提出先市区町村を入力してください', 'error')
      return
    }
    if (!ownerName.trim()) {
      showToast('所有者氏名を入力してください', 'error')
      return
    }
    if (rows.length === 0) {
      showToast('対象物件を1件以上追加してください', 'error')
      return
    }

    setGenerating(true)
    try {
      const res = await fetch('/api/documents/fixed-asset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          variant,
          requestDate,
          municipality: municipality.trim(),
          nendo: nendo.trim(),
          copyCount,
          certKinds,
          ownerName: ownerName.trim(),
          ownerAddress: ownerAddress.trim(),
          properties: rows.map(r => ({
            landAddress: r.landAddress.trim(),
            buildingAddress: r.buildingAddress.trim(),
            kaokuBango: r.kaokuBango.trim(),
            needNeighborPrice: r.needNeighborPrice,
          })),
          kogawaseAmount: kogawaseAmount === '' ? null : Number(kogawaseAmount),
          notes: notes.trim(),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(err.error ?? '生成に失敗しました', 'error')
        return
      }

      const blob = await res.blob()
      const filename = `固定資産申請書_${caseData.case_number ?? ''}_${municipality}_${requestDate}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast('固定資産申請書を生成しました', 'success')
      onClose()
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="固定資産証明等申請書（名寄帳・評価証明）を作成"
      maxWidth="max-w-5xl"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={generating}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {generating ? '生成中…' : 'Excelで出力'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 基本設定 */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">様式バリエーション</label>
            <select
              value={variant}
              onChange={e => setVariant(e.target.value as FixedAssetVariant)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400"
            >
              {(Object.keys(FIXED_ASSET_VARIANT_PRESETS) as FixedAssetVariant[]).map(key => (
                <option key={key} value={key}>{FIXED_ASSET_VARIANT_PRESETS[key].label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">契約形態：{caseData.contract_type ?? '未設定'}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">請求日</label>
            <input
              type="date"
              value={requestDate}
              onChange={e => setRequestDate(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">提出先市区町村</label>
            <input
              type="text"
              value={municipality}
              onChange={e => setMunicipality(e.target.value)}
              placeholder="例: 横須賀市"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </div>
        </section>

        {/* プリセット情報 */}
        <section className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex gap-3">
            <span className="text-gray-500 w-20">使用目的:</span>
            <span className="text-gray-800">{preset.purpose}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-20">依頼者:</span>
            <span className="text-gray-800">{caseData.clients?.name ?? '（未設定）'} / {caseData.clients?.address ?? '（住所未設定）'}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-20">被相続人:</span>
            <span className="text-gray-800">{caseData.deceased_name ?? '（未設定）'}</span>
          </div>
        </section>

        {/* 申請内容 */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">申請内容</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">年度</span>
              <input
                type="text"
                value={nendo}
                onChange={e => setNendo(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">部数</span>
              <input
                type="number"
                min={1}
                value={copyCount}
                onChange={e => setCopyCount(Number(e.target.value) || 1)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </label>
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-gray-600 mb-1">証明書の種類（複数選択可・出力後に所定欄に丸をつける想定）</span>
            <div className="flex flex-wrap gap-1.5">
              {CERT_KINDS.map(kind => {
                const on = certKinds.includes(kind)
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleCertKind(kind)}
                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                      on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {kind}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* 所有者情報 */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">所有者情報</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">所有者氏名</span>
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              />
              <span className="text-[10px] text-gray-400">出力時に「故 〜」形式で付与されます</span>
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">所有者住所（過去住所複数可）</span>
              <input
                type="text"
                value={ownerAddress}
                onChange={e => setOwnerAddress(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </label>
          </div>
        </section>

        {/* 対象資産 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">対象資産（最大5件）</h3>
            <button
              onClick={addRow}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors"
            >
              ＋ 物件を追加
            </button>
          </div>
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.id} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600">物件 #{idx + 1}</span>
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-gray-300 hover:text-red-500 text-xs"
                  >
                    🗑 削除
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">土地 所在（登記簿上の地番）</span>
                    <input
                      type="text"
                      value={row.landAddress}
                      onChange={e => updateRow(row.id, { landAddress: e.target.value })}
                      placeholder="例: 横須賀市三春町〇〇〇番地"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">家屋 所在</span>
                    <input
                      type="text"
                      value={row.buildingAddress}
                      onChange={e => updateRow(row.id, { buildingAddress: e.target.value })}
                      placeholder="家屋がない場合は空欄"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">家屋番号</span>
                    <input
                      type="text"
                      value={row.kaokuBango}
                      onChange={e => updateRow(row.id, { kaokuBango: e.target.value })}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-gray-700 mt-4 md:mt-5">
                    <input
                      type="checkbox"
                      checked={row.needNeighborPrice}
                      onChange={e => updateRow(row.id, { needNeighborPrice: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    近傍宅地価格 要
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 備考・小為替 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">備考（入力フリー欄）</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:border-blue-400"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">同封小為替（円）</span>
            <input
              type="number"
              min={0}
              value={kogawaseAmount}
              onChange={e => setKogawaseAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="例: 600"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </label>
        </section>

        {properties.length > 5 && (
          <p className="text-[11px] text-amber-600 text-center">
            ※ 案件に{properties.length}件の物件が登録されていますが、本様式は最大5件までです。6件目以降は別途申請書を作成してください。
          </p>
        )}
      </div>
    </Modal>
  )
}
