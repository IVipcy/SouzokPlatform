'use client'

import { useState, useMemo } from 'react'
import { Plus, Trash2, Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { buildDeliverableOptions, type DeliverableOption } from '@/lib/deliverables'
import type { FinancialAssetRow, RealEstatePropertyRow, KosekiRequestRow, ContractDocumentRow, RealEstateAcquisitionRow, AgreementDispatchRow, HeirRow } from '@/types'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
}

type ItemDraft = {
  key: string  // クライアント側の一意キー（再レンダリング用）
  item_name: string
  quantity: string  // 文字列で保持して入力柔軟性を確保
  received_from: string
  linked: string  // 取得物リンク `${kind}:${id}:${field}`（空=リンクなし）
  otherMode: boolean  // 受信待ちに無い物を自由入力するモード（true=名称入力欄を表示）
}

// 郵送種別（〒の種類）。封筒＝1受信単位。
export const POSTAL_TYPES = ['速達', '簡易書留', '赤レタパ', '青レタパ'] as const

type Props = {
  isOpen: boolean
  onClose: () => void
  cases: CaseLite[]
  teams: { id: string; name: string }[]
  onSaved: () => void
}

function newItem(): ItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    item_name: '',
    quantity: '',
    received_from: '',
    linked: '',
    otherMode: false,
  }
}

export default function NewDocumentReceiptModal({ isOpen, onClose, cases, teams, onSaved }: Props) {
  const todayYmd = new Date().toISOString().slice(0, 10)

  const [caseQuery, setCaseQuery] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [receivedDate, setReceivedDate] = useState(todayYmd)
  const [postalType, setPostalType] = useState('')
  const [storageTeamId, setStorageTeamId] = useState('')  // 原本格納先チーム（案件選択時に管理担当のチームを初期選択）
  const [items, setItems] = useState<ItemDraft[]>([newItem()])
  const [deliverables, setDeliverables] = useState<DeliverableOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // モーダルを閉じるたびに状態リセット
  const handleClose = () => {
    if (saving) return
    setCaseQuery('')
    setSelectedCaseId(null)
    setReceivedDate(todayYmd)
    setPostalType('')
    setStorageTeamId('')
    setItems([newItem()])
    setDeliverables([])
    setError('')
    onClose()
  }

  // 案件を選択し、その案件の取得物（リンク候補）を取得
  const selectCase = async (id: string) => {
    setSelectedCaseId(id)
    setDeliverables([])
    const supabase = createClient()
    const [fa, re, ac, ko, cd, cs, ad, hr, salesRow] = await Promise.all([
      supabase.from('financial_assets').select('*').eq('case_id', id),
      supabase.from('real_estate_properties').select('*').eq('case_id', id),
      supabase.from('real_estate_acquisitions').select('*').eq('case_id', id).order('sort_order'),
      supabase.from('koseki_requests').select('*').eq('case_id', id).order('sort_order'),
      supabase.from('contract_documents').select('*').eq('case_id', id).order('sort_order'),
      supabase.from('cases').select('intake_roles').eq('id', id).single(),
      supabase.from('agreement_dispatches').select('*').eq('case_id', id),
      supabase.from('heirs').select('*').eq('case_id', id).order('sort_order'),
      // 原本格納先の初期値：この案件の受注担当のチーム（チームに管理担当も受注担当も所属）
      supabase.from('case_members').select('members(team_id)').eq('case_id', id).eq('role', 'sales').limit(1).maybeSingle(),
    ])
    // 受注担当のチームを原本格納先の初期選択に（未設定なら空のまま）
    const salesTeam = (salesRow.data as { members?: { team_id?: string | null } | null } | null)?.members?.team_id ?? ''
    if (salesTeam && teams.some(t => t.id === salesTeam)) setStorageTeamId(salesTeam)
    // 案件がやっている業務(intake_roles)を候補のフィルタに使う（オーダーシートが正）
    const roles = (cs.data?.intake_roles ?? []) as Array<{ gyomu?: string | null }>
    const activeGyomu = new Set(roles.map(r => r.gyomu).filter((g): g is string => !!g))
    setDeliverables(buildDeliverableOptions(
      activeGyomu,
      (fa.data ?? []) as FinancialAssetRow[],
      (ac.data ?? []) as unknown as RealEstateAcquisitionRow[],
      (re.data ?? []) as RealEstatePropertyRow[],
      (ko.data ?? []) as KosekiRequestRow[],
      (cd.data ?? []) as ContractDocumentRow[],
      (ad.data ?? []) as AgreementDispatchRow[],
      (hr.data ?? []) as HeirRow[],
    ))
  }

  // リンク候補をグループ別にまとめる（預金/証券/信託/不動産）
  const groupedDeliverables = useMemo(() => {
    const m = new Map<string, DeliverableOption[]>()
    for (const o of deliverables) {
      const arr = m.get(o.group) ?? []
      arr.push(o)
      m.set(o.group, arr)
    }
    return Array.from(m.entries())
  }, [deliverables])

  // 案件検索結果
  const filteredCases = useMemo(() => {
    const q = caseQuery.trim().toLowerCase()
    if (!q) return cases.slice(0, 8)
    return cases
      .filter(c =>
        c.case_number.toLowerCase().includes(q) ||
        c.deal_name.toLowerCase().includes(q),
      )
      .slice(0, 20)
  }, [cases, caseQuery])

  const selectedCase = useMemo(
    () => (selectedCaseId ? cases.find(c => c.id === selectedCaseId) : null),
    [cases, selectedCaseId],
  )

  const addItem = () => {
    setItems(prev => [...prev, newItem()])
  }

  const removeItem = (key: string) => {
    setItems(prev => (prev.length <= 1 ? prev : prev.filter(i => i.key !== key)))
  }

  const updateItem = (key: string, patch: Partial<ItemDraft>) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)))
  }

  const handleSubmit = async () => {
    setError('')
    if (!selectedCaseId) {
      setError('案件を選択してください')
      return
    }
    if (!receivedDate) {
      setError('到着日を入力してください')
      return
    }
    const validItems = items.filter(i => i.item_name.trim() !== '')
    if (validItems.length === 0) {
      setError('到着物を1件以上入力してください')
      return
    }

    setSaving(true)
    const supabase = createClient()
    // 1. 親レコード作成（sequence_no は DB トリガで自動採番）
    const { data: receiptInserted, error: insertErr } = await supabase
      .from('document_receipts')
      .insert({
        case_id: selectedCaseId,
        received_date: receivedDate,
        postal_type: postalType || null,
        storage_team_id: storageTeamId || null,
      })
      .select('id')
      .single()

    if (insertErr || !receiptInserted) {
      setError(`受信レコードの作成に失敗しました: ${insertErr?.message ?? ''}`)
      setSaving(false)
      return
    }

    // 2. 受領した物はすべて書類タブ(case_documents)に「受領書類」として作成（PDF保管を一本化）
    const docRows = validItems.map(it => ({
      case_id: selectedCaseId,
      document_name: it.item_name.trim(),
      received_date: receivedDate,
      quantity: it.quantity ? Number(it.quantity) : 1,
      generated_by: 'receipt',
      notes: it.received_from.trim() ? `差出人: ${it.received_from.trim()}` : null,
    }))
    const { data: createdDocs, error: docErr } = await supabase
      .from('case_documents')
      .insert(docRows)
      .select('id')
    if (docErr || !createdDocs || createdDocs.length !== validItems.length) {
      setError(`到着物の作成に失敗しました: ${docErr?.message ?? ''}`)
      setSaving(false)
      return
    }

    // 3. 子レコード（受領項目）一括 INSERT。書類ID・取得物リンクを紐づけ
    const parseLink = (v: string) => {
      if (!v) return { linked_kind: null, linked_id: null, linked_field: null }
      const [kind, id, field] = v.split(':')
      return { linked_kind: kind, linked_id: id, linked_field: field }
    }
    const itemRows = validItems.map((it, idx) => ({
      receipt_id: receiptInserted.id,
      item_name: it.item_name.trim(),
      quantity: it.quantity ? Number(it.quantity) : null,
      received_from: it.received_from.trim() || null,
      sort_order: idx,
      case_document_id: (createdDocs[idx] as { id: string }).id,
      ...parseLink(it.linked),
    }))
    const { error: itemsErr } = await supabase
      .from('document_receipt_items')
      .insert(itemRows)

    if (itemsErr) {
      // 親は作られたまま残る。エラー表示
      setError(`項目の登録に失敗しました: ${itemsErr.message}`)
      setSaving(false)
      return
    }

    // 取得物への受領日反映は「W-Check完了（受信確定）」時に行う（DocumentReceiptList）。
    // ここでは紐づけ情報（linked_kind/linked_id/linked_field）を document_receipt_items に
    // 記録するのみ。確認前に各タブへ受信マークが付くのを防ぐ。

    // 4. 受注担当へ通知（書類が届いた → クリックで案件の書類タブへ）
    const { data: salesMembers } = await supabase
      .from('case_members')
      .select('member_id')
      .eq('case_id', selectedCaseId)
      .eq('role', 'sales')
    if (salesMembers && salesMembers.length > 0) {
      const itemNames = validItems.map(i => i.item_name.trim()).join('・')
      const notifRows = (salesMembers as { member_id: string }[]).map(m => ({
        member_id: m.member_id,
        type: 'doc_received',
        case_id: selectedCaseId,
        title: '到着物が届きました',
        body: `${itemNames}${selectedCase ? `（${selectedCase.deal_name}）` : ''}`,
      }))
      await supabase.from('notifications').insert(notifRows)
    }

    setSaving(false)
    showToast('到着物の受信を登録しました', 'success')
    onSaved()
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="到着物の受信を登録"
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>
            {saving ? '登録中...' : '登録する'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* 案件検索・選択 */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">案件 <span className="text-red-500">*</span></label>
          {selectedCase ? (
            <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
              <div className="text-[13px]">
                <span className="font-mono font-semibold text-brand-700">{selectedCase.case_number}</span>
                <span className="ml-2 text-gray-800">{selectedCase.deal_name}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCaseId(null); setCaseQuery(''); setDeliverables([]) }}
                className="text-[12px] text-gray-500 hover:text-gray-700"
              >
                変更
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={caseQuery}
                  onChange={e => setCaseQuery(e.target.value)}
                  placeholder="案件管理番号または案件名で検索"
                  className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
                />
              </div>
              <div className="mt-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {filteredCases.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-gray-400">該当する案件がありません</div>
                ) : (
                  filteredCases.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCase(c.id)}
                      className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-brand-50 transition-colors"
                    >
                      <span className="font-mono font-semibold text-brand-700">{c.case_number}</span>
                      <span className="ml-2 text-gray-800">{c.deal_name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 到着日 ＋ 〒の種類（封筒単位） */}
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">到着日 <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={receivedDate}
              onChange={e => setReceivedDate(e.target.value)}
              className="w-48 px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">〒の種類</label>
            <select
              value={postalType}
              onChange={e => setPostalType(e.target.value)}
              className="w-40 px-3 py-2 text-[13px] border border-gray-300 rounded-lg bg-white focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
            >
              <option value="">選択…</option>
              {POSTAL_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">原本格納先<span className="ml-1 font-normal text-gray-400">チームのBOX</span></label>
            <select
              value={storageTeamId}
              onChange={e => setStorageTeamId(e.target.value)}
              className="w-48 px-3 py-2 text-[13px] border border-gray-300 rounded-lg bg-white focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
            >
              <option value="">格納先を選択</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* 到着物（複数） */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[12px] font-semibold text-gray-500">到着物 <span className="text-red-500">*</span></label>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={addItem}
            >
              到着物を追加
            </Button>
          </div>
          <div className="space-y-2">
            {items.map(it => {
              const useSelect = deliverables.length > 0
              // 他の行で既に選んだ受領待ちは、この行の候補から外す（同じ物を二重に紐づけない）
              const usedByOthers = new Set(items.filter(x => x.key !== it.key && x.linked).map(x => x.linked))
              const groupedForRow = groupedDeliverables
                .map(([group, opts]) => [group, opts.filter(o => !usedByOthers.has(o.value))] as const)
                .filter(([, opts]) => opts.length > 0)
              return (
                <div key={it.key} className="border border-gray-200 rounded-md p-2.5">
                  <div className="grid grid-cols-[1fr_72px_1fr_28px] gap-2 items-center">
                    {useSelect ? (
                      <select
                        value={it.otherMode ? '__other__' : it.linked}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '__other__') updateItem(it.key, { otherMode: true, linked: '', item_name: '' })
                          else if (v === '') updateItem(it.key, { otherMode: false, linked: '', item_name: '' })
                          else {
                            const opt = deliverables.find(o => o.value === v)
                            updateItem(it.key, { otherMode: false, linked: v, item_name: opt?.label ?? '' })
                          }
                        }}
                        className="px-2.5 py-1.5 text-[13px] border border-gray-300 rounded-md bg-white outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-300"
                      >
                        <option value="">受領待ちの到着物から選ぶ</option>
                        {groupedForRow.map(([group, opts]) => (
                          <optgroup key={group} label={group}>
                            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        ))}
                        <option value="__other__">その他（自由入力）</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={it.item_name}
                        onChange={e => updateItem(it.key, { item_name: e.target.value })}
                        placeholder="到着物（例: 戸籍）"
                        className="px-2.5 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
                      />
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={it.quantity}
                      onChange={e => updateItem(it.key, { quantity: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="通数"
                      className="px-2.5 py-1.5 text-[13px] text-right font-mono border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
                    />
                    <input
                      type="text"
                      value={it.received_from}
                      onChange={e => updateItem(it.key, { received_from: e.target.value })}
                      placeholder="差出人（例: 名古屋市区役所）"
                      className="px-2.5 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(it.key)}
                      disabled={items.length <= 1}
                      className="text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed p-1"
                      title="この行を削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* 「その他」を選んだときだけ名称入力（紐づけなし） */}
                  {useSelect && it.otherMode && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-gray-300 text-[14px] leading-none">↳</span>
                      <input
                        type="text"
                        value={it.item_name}
                        onChange={e => updateItem(it.key, { item_name: e.target.value })}
                        placeholder="到着物の名称を入力（例: 戸籍）"
                        className="flex-1 px-2.5 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed">
          到着物は案件の「到着物」タブに保存されます。受信待ちに紐づけると、登録後の <span className="font-semibold text-gray-500">W-Check（受信確定）</span> で各タブの受領日へ自動反映されます（タスク不要ならW-Checkだけで完了）。
        </p>
      </div>
    </Modal>
  )
}
