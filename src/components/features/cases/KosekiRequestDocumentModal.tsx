'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  KOSEKI_VARIANT_PRESETS,
  KOSEKI_PURPOSES,
  KOSEKI_AGENT_OFFICES,
  defaultKosekiVariant,
  type KosekiVariant,
  type KosekiAgentOfficeId,
} from '@/lib/officeProfiles'
import { KOSEKI_REQUEST_TYPES } from '@/lib/constants'
import type { CaseRow, TaskRow, HeirRow, KosekiRequestRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  tasks: TaskRow[]
  heirs: HeirRow[]
  /** 戸籍請求一覧（相続人調査タブ）。あれば出力の初期行をここからプリセット。 */
  kosekiRequests?: KosekiRequestRow[]
  /** タスク詳細から作成する際に紐づけるタスクID */
  defaultTaskId?: string
}

/** doc_types の自由記述文字列から請求種別を抽出（マッチしなければ空＝未選択）。
 *  ①勝手に「戸籍・謄本」を付けない。実務タブで選んでいればそれを反映、無ければ空。 */
function parseRequestTypes(docTypes: string | null | undefined): string[] {
  return KOSEKI_REQUEST_TYPES.filter(t => (docTypes ?? '').includes(t))
}

// 全角→半角、数字以外を除去
const toDigits = (s: string) => s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[^\d]/g, '')

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
    requestTypes: [],  // ① デフォルト解除（勝手に「戸籍・謄本」を付けない）
    copyCount: 1,
    kogawaseAmount: '',
    notes: '',
    ...partial,
  }
}

export default function KosekiRequestDocumentModal({ isOpen, onClose, caseData, tasks, heirs, kosekiRequests = [], defaultTaskId }: Props) {
  const [variant, setVariant] = useState<KosekiVariant>(defaultKosekiVariant(caseData.contract_type))
  const [requestDate, setRequestDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [purpose, setPurpose] = useState<string>(KOSEKI_PURPOSES[0])  // 使用目的
  const [agentOffice, setAgentOffice] = useState<KosekiAgentOfficeId>('kyodo')  // 上記代理人の所在地（拠点）
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
    setPurpose(KOSEKI_PURPOSES[0])
    const honseki = caseData.deceased_registered_address ?? ''
    const hittousha = caseData.deceased_name ?? ''
    if (kosekiRequests.length > 0) {
      // 戸籍請求一覧（誰の・どこに・どの種別）から初期行を作成。本籍・筆頭者は被相続人からプリセット。
      setRows(kosekiRequests.map(k => {
        const who = k.target_person || caseData.deceased_name || ''
        const rangeNote = k.range_text ? `${who}さまの${k.range_text}の一連の戸籍が必要です。` : ''
        return createRow({
          municipality: k.request_to ?? '',
          honseki,
          hittousha,
          targetName: k.target_person ?? caseData.deceased_name ?? '',
          requestTypes: parseRequestTypes(k.doc_types),
          notes: [rangeNote, k.request_reason, k.request_reason_other, k.notes].filter(Boolean).join(' ') || '',
        })
      }))
    } else if (prefilledCities.length > 0) {
      setRows(prefilledCities.map(city => createRow({ municipality: city, honseki, hittousha, targetName: caseData.deceased_name ?? '' })))
    } else {
      setRows([createRow({ honseki, hittousha, targetName: caseData.deceased_name ?? '' })])
    }
  }, [isOpen, prefilledCities, kosekiRequests, caseData.contract_type, caseData.deceased_name, caseData.deceased_registered_address])

  const preset = KOSEKI_VARIANT_PRESETS[variant]

  // ② 「請求に係る者」プルダウン用の候補（被相続人＋相続人＋その他）。
  //   選ぶと本籍・筆頭者もその人のものにセットする（違えば手で直せる）。
  type TargetOption = { key: string; label: string; name: string; honseki: string; hittousha: string }
  const deceasedOpt: TargetOption | null = caseData.deceased_name
    ? { key: 'deceased', label: `${caseData.deceased_name}（被相続人）`, name: caseData.deceased_name, honseki: caseData.deceased_registered_address ?? '', hittousha: caseData.deceased_name }
    : null
  const heirOpts: TargetOption[] = heirs
    .filter(h => (h.name ?? '').trim())
    .map(h => ({
      key: `heir:${h.id}`,
      label: `${h.name}${h.relationship_type ? `（${h.relationship_type}）` : h.relationship ? `（${h.relationship}）` : ''}`,
      name: h.name!,
      // 相続人が結婚済で自分の戸籍を持っていれば本人が筆頭者。分からなければ本人名にしておき、手で直せるようにする。
      honseki: h.registered_address ?? '',
      hittousha: h.name!,
    }))
  const targetOptions: TargetOption[] = [...(deceasedOpt ? [deceasedOpt] : []), ...heirOpts]
  const findTargetKey = (row: RequestRow): string => {
    const hit = targetOptions.find(o => o.name === row.targetName)
    return hit ? hit.key : (row.targetName ? 'other' : '')
  }
  const pickTarget = (id: string, key: string) => {
    if (key === 'other' || key === '') { updateRow(id, { targetName: '' }); return }
    const opt = targetOptions.find(o => o.key === key)
    if (!opt) return
    // 対象者を選んだら本籍・筆頭者もその人のものに合わせる（違えば手で直せる）。
    updateRow(id, { targetName: opt.name, honseki: opt.honseki, hittousha: opt.hittousha })
  }

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
            purpose,
            rows: normalizedRows,
            rowIndex: i,
            taskId: defaultTaskId ?? null,
            agentOffice,
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
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
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
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400"
            >
              {(Object.keys(KOSEKI_VARIANT_PRESETS) as KosekiVariant[]).map(key => (
                <option key={key} value={key}>{KOSEKI_VARIANT_PRESETS[key].label}</option>
              ))}
            </select>
            <p className="text-[12px] text-gray-400 mt-1">契約形態：{caseData.contract_type ?? '未設定'}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">請求日</label>
            <input
              type="date"
              value={requestDate}
              onChange={e => setRequestDate(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">使用目的</label>
            <select
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400"
            >
              {KOSEKI_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">請求者所在地（上記代理人）</label>
            <select
              value={agentOffice}
              onChange={e => setAgentOffice(e.target.value as KosekiAgentOfficeId)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400"
            >
              {KOSEKI_AGENT_OFFICES.map(o => <option key={o.id} value={o.id}>{o.label}（{o.line1} {o.line2}）</option>)}
            </select>
          </div>
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
            <span className="text-gray-800">{purpose}</span>
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
                className="text-[13px] font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1 rounded-md transition-colors"
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
                    className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                    title="この請求先を削除"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                    削除
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
                      type="text"
                      inputMode="numeric"
                      value={row.copyCount ? String(row.copyCount) : ''}
                      onChange={e => { const n = Number(toDigits(e.target.value)); updateRow(row.id, { copyCount: n > 0 ? n : 1 }) }}
                      className="input-base"
                      style={{ textAlign: 'right' }}
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
                  <Field label="請求に係る者">
                    {targetOptions.length > 0 ? (
                      <>
                        <select
                          value={findTargetKey(row)}
                          onChange={e => {
                            const k = e.target.value
                            if (k === 'other') updateRow(row.id, { targetName: '' })
                            else pickTarget(row.id, k)
                          }}
                          className="input-base"
                          style={{ background: 'white' }}
                        >
                          <option value="">— 選択 —</option>
                          {targetOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          <option value="other">その他（自由入力）</option>
                        </select>
                        {findTargetKey(row) === 'other' && (
                          <input
                            type="text"
                            value={row.targetName}
                            onChange={e => updateRow(row.id, { targetName: e.target.value })}
                            placeholder="氏名を入力"
                            className="input-base"
                            style={{ marginTop: 4 }}
                          />
                        )}
                      </>
                    ) : (
                      <input
                        type="text"
                        value={row.targetName}
                        onChange={e => updateRow(row.id, { targetName: e.target.value })}
                        className="input-base"
                      />
                    )}
                  </Field>
                  <Field label="同封小為替（円）">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.kogawaseAmount === '' ? '' : Number(row.kogawaseAmount).toLocaleString('en-US')}
                      onChange={e => { const d = toDigits(e.target.value); updateRow(row.id, { kogawaseAmount: d === '' ? '' : Number(d) }) }}
                      placeholder="例: 750"
                      className="input-base"
                      style={{ textAlign: 'right' }}
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
                          className={`text-[13px] px-2 py-1 rounded-md border transition-colors ${
                            on
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
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
          <p className="text-[12px] text-gray-400 text-center">
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
      <span className="block text-[13px] font-semibold text-gray-600 mb-0.5">{label}</span>
      {children}
    </label>
  )
}
