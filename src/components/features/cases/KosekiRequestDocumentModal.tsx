'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  KOSEKI_VARIANT_PRESETS,
  defaultKosekiVariant,
  type KosekiVariant,
} from '@/lib/officeProfiles'
import { KOSEKI_REQUEST_TYPES } from '@/lib/constants'
import type { CaseRow, TaskRow, HeirRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  tasks: TaskRow[]
  heirs: HeirRow[]
}

type RequestRow = {
  id: string
  municipality: string            // 提出先市区町村名（●●市 等）
  honseki: string                 // 本籍・住所
  hittousha: string               // 筆頭者氏名／世帯主氏名
  targetName: string              // 請求に係る者の氏名
  requestTypes: string[]          // 戸籍/除籍/原戸籍/謄本/抄本/住民票/除票/附票
  copyCount: number               // 通数
  kogawaseAmount: number | ''     // 同封小為替（円）
  notes: string                   // 備考フリーテキスト
}

const NEW_ID = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function createRow(partial: Partial<RequestRow> = {}): RequestRow {
  return {
    id: NEW_ID(),
    municipality: '',
    honseki: '',
    hittousha: '',
    targetName: '',
    requestTypes: ['戸籍', '謄本'],
    copyCount: 1,
    kogawaseAmount: '',
    notes: '',
    ...partial,
  }
}

export default function KosekiRequestDocumentModal({ isOpen, onClose, caseData, tasks, heirs }: Props) {
  const [variant, setVariant] = useState<KosekiVariant>(defaultKosekiVariant(caseData.contract_type))
  const [requestDate, setRequestDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [submitCourt, setSubmitCourt] = useState<string>('')  // 検認用: 家庭裁判所名
  const [rows, setRows] = useState<RequestRow[]>([])
  const [generating, setGenerating] = useState(false)

  // 戸籍請求タスク（koseki_request_create）の ext_data.submissions から市区町村リストを初期ロード
  const prefilledCities = useMemo(() => {
    const kosekiTask = tasks.find(t => t.template_key === 'koseki_request_create')
    if (!kosekiTask) return [] as string[]
    const ext = (kosekiTask.ext_data ?? {}) as Record<string, unknown>
    const submissions = Array.isArray(ext.submissions) ? (ext.submissions as Array<{ city?: string }>) : []
    return submissions.map(s => s.city ?? '').filter(Boolean)
  }, [tasks])

  useEffect(() => {
    if (!isOpen) return
    // モーダルを開くたびにリセット
    setVariant(defaultKosekiVariant(caseData.contract_type))
    setRequestDate(new Date().toISOString().slice(0, 10))
    setSubmitCourt('')
    if (prefilledCities.length > 0) {
      setRows(prefilledCities.map(city => createRow({
        municipality: city,
        honseki: caseData.deceased_registered_address ?? '',
        hittousha: caseData.deceased_name ?? '',
        targetName: caseData.deceased_name ?? '',
      })))
    } else {
      setRows([createRow({
        honseki: caseData.deceased_registered_address ?? '',
        hittousha: caseData.deceased_name ?? '',
        targetName: caseData.deceased_name ?? '',
      })])
    }
  }, [isOpen, prefilledCities, caseData.contract_type, caseData.deceased_name, caseData.deceased_registered_address])

  const preset = KOSEKI_VARIANT_PRESETS[variant]

  const addRow = () => setRows(r => [...r, createRow({
    honseki: caseData.deceased_registered_address ?? '',
    hittousha: caseData.deceased_name ?? '',
    targetName: caseData.deceased_name ?? '',
  })])

  const updateRow = (id: string, patch: Partial<RequestRow>) =>
    setRows(r => r.map(row => row.id === id ? { ...row, ...patch } : row))

  const deleteRow = (id: string) =>
    setRows(r => r.filter(row => row.id !== id))

  const toggleRequestType = (id: string, type: string) => {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const has = row.requestTypes.includes(type)
    updateRow(id, {
      requestTypes: has ? row.requestTypes.filter(t => t !== type) : [...row.requestTypes, type],
    })
  }

  const handleGenerate = async () => {
    if (rows.length === 0) {
      showToast('請求先を1件以上追加してください', 'error')
      return
    }
    if (!caseData.clients?.name || !caseData.clients?.address) {
      showToast('依頼者の氏名・住所が未入力です', 'error')
      return
    }
    if (variant === 'ikiiki_kennin' && !submitCourt.trim()) {
      showToast('検認の場合は提出先（家庭裁判所名）を入力してください', 'error')
      return
    }

    setGenerating(true)
    try {
      const normalizedRows = rows.map(r => ({
        municipality: r.municipality.trim(),
        honseki: r.honseki.trim(),
        hittousha: r.hittousha.trim(),
        targetName: r.targetName.trim(),
        requestTypes: r.requestTypes,
        copyCount: Number(r.copyCount) || 1,
        kogawaseAmount: r.kogawaseAmount === '' ? null : Number(r.kogawaseAmount),
        notes: r.notes.trim(),
      }))

      // 請求先ごとに1xlsxを生成 → 順次ダウンロード
      for (let i = 0; i < normalizedRows.length; i++) {
        const res = await fetch('/api/documents/koseki-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: caseData.id,
            variant,
            requestDate,
            submitCourt: submitCourt.trim() || null,
            rows: normalizedRows,
            rowIndex: i,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
          showToast(`${i + 1}件目の生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
          return
        }

        const blob = await res.blob()
        const cityLabel = normalizedRows[i].municipality || `請求${i + 1}`
        const filename = `戸籍請求書_${caseData.case_number ?? ''}_${cityLabel}_${requestDate}.xlsx`
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        // 連続ダウンロードで抑制されないよう少し待機
        if (i < normalizedRows.length - 1) await new Promise(r => setTimeout(r, 300))
      }

      showToast(`${normalizedRows.length}件の戸籍請求書を生成しました`, 'success')
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
      title="戸籍・住民票等請求書 を作成"
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
              onChange={e => setVariant(e.target.value as KosekiVariant)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400"
            >
              {(Object.keys(KOSEKI_VARIANT_PRESETS) as KosekiVariant[]).map(key => (
                <option key={key} value={key}>{KOSEKI_VARIANT_PRESETS[key].label}</option>
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
          {variant === 'ikiiki_kennin' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">提出先（家庭裁判所）</label>
              <input
                type="text"
                value={submitCourt}
                onChange={e => setSubmitCourt(e.target.value)}
                placeholder="例: 横浜家庭裁判所"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </div>
          )}
        </section>

        {/* プリセット内容表示 */}
        <section className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex gap-3">
            <span className="text-gray-500 w-24">請求者欄:</span>
            <span className="text-gray-800">{preset.requesterLabel}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-24">代理人欄:</span>
            <span className="text-gray-800">{preset.agentLabel ?? '（表示なし）'}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-24">使用目的:</span>
            <span className="text-gray-800">{preset.purpose}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-24">依頼者:</span>
            <span className="text-gray-800">{caseData.clients?.name ?? '（未設定）'} / {caseData.clients?.address ?? '（住所未設定）'}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-24">被相続人:</span>
            <span className="text-gray-800">{caseData.deceased_name ?? '（未設定）'}</span>
          </div>
        </section>

        {/* 請求先一覧 */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">請求先一覧（{rows.length}件）</h3>
            <div className="flex gap-2">
              <button
                onClick={addRow}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors"
              >
                ＋ 請求先を追加
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.id} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600">請求先 #{idx + 1}</span>
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-gray-300 hover:text-red-500 text-xs"
                    title="この請求先を削除"
                  >
                    🗑 削除
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                  <Field label="提出先市区町村">
                    <input
                      type="text"
                      value={row.municipality}
                      onChange={e => updateRow(row.id, { municipality: e.target.value })}
                      placeholder="例: 横浜市西区"
                      className="input-base"
                    />
                  </Field>
                  <Field label="通数">
                    <input
                      type="number"
                      min={1}
                      value={row.copyCount}
                      onChange={e => updateRow(row.id, { copyCount: Number(e.target.value) || 1 })}
                      className="input-base"
                    />
                  </Field>
                  <Field label="本籍・住所">
                    <input
                      type="text"
                      value={row.honseki}
                      onChange={e => updateRow(row.id, { honseki: e.target.value })}
                      className="input-base"
                    />
                  </Field>
                  <Field label="筆頭者の氏名">
                    <input
                      type="text"
                      value={row.hittousha}
                      onChange={e => updateRow(row.id, { hittousha: e.target.value })}
                      className="input-base"
                    />
                  </Field>
                  <Field label="請求に係る者の氏名">
                    <input
                      type="text"
                      value={row.targetName}
                      onChange={e => updateRow(row.id, { targetName: e.target.value })}
                      className="input-base"
                    />
                  </Field>
                  <Field label="同封小為替（円）">
                    <input
                      type="number"
                      min={0}
                      value={row.kogawaseAmount}
                      onChange={e => updateRow(row.id, { kogawaseAmount: e.target.value === '' ? '' : Number(e.target.value) })}
                      placeholder="例: 750"
                      className="input-base"
                    />
                  </Field>
                </div>
                <Field label="請求の種別（複数選択可）">
                  <div className="flex flex-wrap gap-1.5">
                    {KOSEKI_REQUEST_TYPES.map(type => {
                      const on = row.requestTypes.includes(type)
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleRequestType(row.id, type)}
                          className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                            on
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                          }`}
                        >
                          {type}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <Field label="備考（例：出生〜死亡まで、現在戸籍と附票、等）">
                  <textarea
                    value={row.notes}
                    onChange={e => updateRow(row.id, { notes: e.target.value })}
                    rows={2}
                    className="input-base resize-none"
                    placeholder="例：○○さまの出生〜死亡までの一連の戸籍が必要です。"
                  />
                </Field>
              </div>
            ))}
          </div>
        </section>

        {heirs.length > 0 && (
          <p className="text-[10px] text-gray-400 text-center">
            ※ 相続人 {heirs.length} 名登録済み。続柄別の戸籍請求が必要な場合は請求先を追加して設定してください。
          </p>
        )}
      </div>

      <style jsx>{`
        :global(.input-base) {
          width: 100%;
          font-size: 13px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          padding: 6px 8px;
          background: white;
          outline: none;
        }
        :global(.input-base:focus) {
          border-color: #60a5fa;
        }
      `}</style>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-gray-600 mb-0.5">{label}</span>
      {children}
    </label>
  )
}
