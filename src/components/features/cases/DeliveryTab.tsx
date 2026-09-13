'use client'

// 納品タブ v4：一覧そのものが「原本管理」の行（到着物と原本管理タブと同じ集合）。
//   お返しする原本 … 原本管理の行（契約時に預かった書類・届いた戸籍・手で足した原本。写しは載せない）
//   お渡しする成果物 … こちらで作った書類（documents）。原本ではないので別の段（一覧のみ）
//
// 行ごとに 対象／対象外、受領先（相続人）、表示名（受領証に載せる名前）、権利証の通知日と識別番号、印鑑証明の相続人名、Wチェック を持ち、
// 保存先はすべて原本管理の手直し表（original_doc_overrides。migration 284）。
// 出払い中（請求に同梱して戻っていない）原本は対象にできない。
// 納品完了 … 対象の全行がWチェック済で活性。押すと対象行の「返却・納品」に手元の数が入り（手元 0）、案件を納品完了に。
// 原本受領証 … 対象行のうち宛先（受領先＝その人 or 共通）の行を載せる。作ったら行に「受領証に載せた日」。

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, PackageCheck, X, RotateCcw, UserCheck, FileText, Users, Mail } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import Button from '@/components/ui/Button'
import HankoStamp from '@/components/ui/HankoStamp'
import { SubTabs } from '@/components/ui/SubTabs'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useOriginalStock } from '@/lib/useOriginalStock'
import { md, type StockRow } from '@/lib/originals'
import { useCurrentMember } from '@/lib/useCurrentMember'
import type { CaseRow, HeirRow, TaskRow, DocumentRow } from '@/types'
import GenponJuryoshoModal from './GenponJuryoshoModal'
import EnvelopeDocumentModal from './EnvelopeDocumentModal'

type Props = {
  caseData: CaseRow
  currentMemberId: string | null
  canManage?: boolean  // 管理担当のみ「納品完了」ボタン可
  heirs?: HeirRow[]    // 相続人紐付モーダル(印鑑証明書)用 + 原本受領証/封筒の郵送先選択用
  tasks?: TaskRow[]    // 封筒生成時のタスク紐付用
  /** こちらで作った書類（お渡しする成果物の段に一覧で出す） */
  createdDocuments?: DocumentRow[]
}

type Selection = 'target' | 'exclude' | null

type DocRow = {
  key: string
  stock: StockRow
  name: string
  displayName: string | null
  quantity: number                   // 手元（納品できる数）
  outstanding: number                // 出払い中
  delivered: number
  latestDate: string | null
  selection: Selection
  checkedById: string | null
  checkedAt: string | null
  toukiNoticeDate: string | null
  toukiNoticeNumber: string | null
  inkanClientNames: string[] | null
  recipientHeirId: string | null
  juryoshoIssuedOn: string | null
}

function statusView(delivery_status: string | null | undefined) {
  const s = delivery_status ?? '準備中'
  if (s === '納品済') return { label: '納品済', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  return { label: '未納品', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
}

type FilterMode = 'unselected' | 'target' | 'exclude'

const isKenriRow = (r: DocRow) => /権利証|権利書/.test(r.displayName || r.name)
const isInkanRow = (r: DocRow) => /印鑑/.test(r.displayName || r.name)

export default function DeliveryTab({ caseData, currentMemberId: serverMemberId, canManage = false, heirs = [], tasks = [], createdDocuments = [] }: Props) {
  const router = useRouter()
  const currentMemberId = useCurrentMember(serverMemberId)
  const { stock, loading, reload } = useOriginalStock(caseData.id)
  const [saving, setSaving] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('unselected')
  const [pane, setPane] = useState<'originals' | 'products'>('originals')
  const [editingName, setEditingName] = useState<Record<string, string>>({})
  const [toukiTarget, setToukiTarget] = useState<DocRow | null>(null)
  const [inkanTarget, setInkanTarget] = useState<DocRow | null>(null)
  const [genponOpen, setGenponOpen] = useState(false)
  const [envelopeOpen, setEnvelopeOpen] = useState(false)
  const [memberNameById, setMemberNameById] = useState<Map<string, string>>(new Map())
  const deliveryStatus = (caseData.delivery_status ?? '準備中') as string

  // Wチェックのハンコ用に名前を引く（必要になったときだけ読む）
  const ensureMembers = async () => {
    if (memberNameById.size > 0) return memberNameById
    const { data } = await createClient().from('members').select('id, name')
    const m = new Map<string, string>(((data ?? []) as Array<{ id: string; name: string }>).map(x => [x.id, x.name]))
    setMemberNameById(m)
    return m
  }
  const checkerIds = stock.map(s => s.override?.delivery_check_by).filter((v): v is string => !!v)
  if (checkerIds.length > 0 && memberNameById.size === 0) void ensureMembers()

  const rows: DocRow[] = useMemo(() => stock.filter(s => !s.copy).map(s => {
    const o = s.override
    return {
      key: s.key, stock: s, name: s.name + (s.person ? `（${s.person}）` : ''),
      displayName: o?.delivery_display_name ?? null,
      quantity: s.onHand, outstanding: s.outstanding, delivered: s.delivered,
      latestDate: null,
      selection: o?.delivery_target === true ? 'target' : o?.delivery_target === false ? 'exclude' : null,
      checkedById: o?.delivery_check_by ?? null, checkedAt: o?.delivery_check_at ?? null,
      toukiNoticeDate: o?.delivery_touki_notice_date ?? null, toukiNoticeNumber: o?.delivery_touki_notice_number ?? null,
      inkanClientNames: o?.delivery_inkan_client_names ?? null,
      recipientHeirId: o?.delivery_recipient_heir_id ?? null,
      juryoshoIssuedOn: o?.juryosho_issued_on ?? null,
    }
  }), [stock])

  // 保存はすべて原本管理の手直し表へ（行が無ければ作る）
  const upsert = async (row: DocRow, patch: Record<string, unknown>) => {
    setSaving(row.key)
    const supabase = createClient()
    const base = { case_id: caseData.id, stock_key: row.key, updated_at: new Date().toISOString(), ...(row.stock.auto ? {} : { doc_name: row.stock.name, person: row.stock.person }) }
    const { error } = await supabase.from('original_doc_overrides').upsert({ ...base, ...patch }, { onConflict: 'case_id,stock_key' })
    setSaving(null)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return false }
    reload()
    return true
  }

  const setSelection = async (row: DocRow, next: Selection) => {
    if (next === 'target' && row.outstanding > 0 && row.quantity === 0) {
      showToast(`${row.displayName || row.name} は出払い中です（${row.stock.outs.map(o => o.label).join('・')}）。戻ってから対象にしてください`, 'error')
      return
    }
    await upsert(row, { delivery_target: next === 'target' ? true : next === 'exclude' ? false : null })
  }
  const toggleCheck = async (row: DocRow) => {
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    const isChecked = !!row.checkedAt
    await ensureMembers()
    await upsert(row, isChecked ? { delivery_check_by: null, delivery_check_at: null } : { delivery_check_by: currentMemberId, delivery_check_at: new Date().toISOString() })
  }
  const setRecipient = async (row: DocRow, heirId: string) => { await upsert(row, { delivery_recipient_heir_id: heirId === '' ? null : heirId }) }
  const commitDisplayName = async (row: DocRow, next: string) => {
    const trimmed = next.trim()
    if (trimmed === (row.displayName ?? '')) return
    if (await upsert(row, { delivery_display_name: trimmed === '' ? null : trimmed })) {
      setEditingName(prev => { const { [row.key]: _, ...rest } = prev; return rest })
    }
  }
  const saveToukiNotice = async (row: DocRow, date: string, number: string) => {
    if (await upsert(row, { delivery_touki_notice_date: date.trim() || null, delivery_touki_notice_number: number.trim() || null })) setToukiTarget(null)
  }
  const saveInkanClientNames = async (row: DocRow, names: string[]) => {
    if (await upsert(row, { delivery_inkan_client_names: names.length > 0 ? names : null })) setInkanTarget(null)
  }

  const targetRows = useMemo(() => rows.filter(r => r.selection === 'target'), [rows])
  const excludeRows = useMemo(() => rows.filter(r => r.selection === 'exclude'), [rows])
  const unselectedRows = useMemo(() => rows.filter(r => r.selection === null), [rows])
  const checkedCount = useMemo(() => targetRows.filter(r => !!r.checkedAt).length, [targetRows])
  const canComplete = targetRows.length > 0 && checkedCount === targetRows.length && deliveryStatus !== '納品済'

  const markDelivered = async () => {
    if (!canManage) return
    if (!confirm('納品完了にします。対象の原本は「返却・納品」に数が入り手元 0 になり、案件ステータスも「納品完了」に更新されます。よろしいですか？')) return
    setConfirming(true)
    const supabase = createClient()
    const today = new Date().toLocaleDateString('sv-SE')
    // 対象行の手元をすべて「返却・納品」へ
    const ups = targetRows.filter(r => r.quantity > 0).map(r => ({
      case_id: caseData.id, stock_key: r.key, delivered_qty: r.delivered + r.quantity, delivered_on: today, updated_at: new Date().toISOString(),
      ...(r.stock.auto ? {} : { doc_name: r.stock.name, person: r.stock.person }),
    }))
    if (ups.length > 0) {
      const { error: e1 } = await supabase.from('original_doc_overrides').upsert(ups, { onConflict: 'case_id,stock_key' })
      if (e1) { setConfirming(false); showToast(`原本管理の更新に失敗しました: ${e1.message}`, 'error'); return }
    }
    const { error } = await supabase.from('cases').update({ delivery_status: '納品済', status: '納品完了', completion_date: today }).eq('id', caseData.id)
    setConfirming(false)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    showToast('納品完了にしました', 'success')
    reload()
    router.refresh()
  }

  // 受領先に選んだ相続人のうち、住所が空の人。宛先なしで封筒を刷らないよう止める。
  const missingAddressHeirs = (() => {
    const ids = new Set(targetRows.map(r => r.recipientHeirId).filter(Boolean) as string[])
    return heirs.filter(h => ids.has(h.id) && !(h.address ?? '').trim())
  })()

  // 原本受領証に載せる行（宛先＝その人 or 共通）。数は手元の数
  const linesFor = (recipientHeirId: string | null) => targetRows
    .filter(r => r.recipientHeirId == null || r.recipientHeirId === recipientHeirId)
    .filter(r => r.quantity > 0)
    .map(r => ({ name: r.displayName || r.name, quantity: r.quantity, toukiDate: r.toukiNoticeDate, toukiNumber: r.toukiNoticeNumber, inkanNames: r.inkanClientNames }))
  const onJuryoshoGenerated = async (recipientHeirId: string | null) => {
    const supabase = createClient()
    const today = new Date().toLocaleDateString('sv-SE')
    const ups = targetRows.filter(r => r.recipientHeirId == null || r.recipientHeirId === recipientHeirId).map(r => ({
      case_id: caseData.id, stock_key: r.key, juryosho_issued_on: today, updated_at: new Date().toISOString(),
      ...(r.stock.auto ? {} : { doc_name: r.stock.name, person: r.stock.person }),
    }))
    if (ups.length > 0) await supabase.from('original_doc_overrides').upsert(ups, { onConflict: 'case_id,stock_key' })
    reload()
  }

  const shownRows = filter === 'target' ? targetRows : filter === 'exclude' ? excludeRows : unselectedRows
  const products = createdDocuments

  return (
    <div className="space-y-3.5">
      <Section title="納品">
        {(() => { const sv = statusView(deliveryStatus); return (
        <div className="flex items-center gap-2 flex-wrap mb-2.5">
          <span className="text-[13px] text-gray-500">納品ステータス</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-semibold border ${sv.cls}`}>{sv.label}</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setGenponOpen(true)} disabled={targetRows.length === 0}
              title={targetRows.length === 0 ? '対象の原本を1件以上選んでください' : 'お客様返却用の原本受領証を作成'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-brand-800 bg-brand-50 border border-brand-300 hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <FileText className="w-3.5 h-3.5" strokeWidth={2} />原本受領証を作成
            </button>
            <button type="button"
              onClick={() => {
                if (missingAddressHeirs.length > 0) { showToast(`住所が未登録です：${missingAddressHeirs.map(h => h.name).join('、')}。相続人一覧で住所を入れてください`, 'error'); return }
                setEnvelopeOpen(true)
              }}
              title={missingAddressHeirs.length > 0 ? '受領先の住所が未登録です' : '返送用の封筒を作成'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-colors ${missingAddressHeirs.length > 0 ? 'text-red-700 bg-red-50 border-red-300 hover:bg-red-100' : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'}`}>
              <Mail className="w-3.5 h-3.5" strokeWidth={2} />封筒印刷
            </button>
            <Button variant="primary" size="sm" onClick={markDelivered} loading={confirming} disabled={!canComplete || !canManage}
              leftIcon={<PackageCheck className="w-3.5 h-3.5" strokeWidth={2.25} />}
              title={!canManage ? 'この案件の管理担当のみ押せます' : (deliveryStatus === '納品済' ? '既に納品済です' : (targetRows.length === 0 ? '対象の原本を1件以上選んでください' : (checkedCount < targetRows.length ? `Wチェックが残 ${targetRows.length - checkedCount} 件` : '')))}>
              納品完了{deliveryStatus === '納品済' ? ' (済)' : canComplete ? '' : targetRows.length === 0 ? ' (対象なし)' : ` (残 ${targetRows.length - checkedCount}件)`}
            </Button>
          </div>
        </div>
        ) })()}

        <SubTabs className="mb-2.5" tabs={[{ key: 'originals', label: 'お返しする原本（原本管理から）', count: rows.length }, { key: 'products', label: 'お渡しする成果物（作成した書類）', count: products.length }]} active={pane} onChange={k => setPane(k as 'originals' | 'products')} />

        {pane === 'products' ? (
          <div>
            <p className="text-[11.5px] text-gray-500 mb-2">こちらで作った書類（AI書類作成・書類作成メニュー）。原本ではないので原本受領証には載りません。</p>
            {products.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-[13px] text-gray-400">作成した書類はまだありません</div>
            ) : (
              <table className="w-full text-[13px] border-collapse">
                <thead><tr><th className="px-3 py-2 text-left font-semibold">書類</th><th className="px-3 py-2 text-left font-semibold w-28">作成日</th><th className="px-3 py-2 text-left font-semibold w-28">ファイル</th></tr></thead>
                <tbody>
                  {products.map(d => (
                    <tr key={d.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-3 py-2 text-gray-800">{d.name}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-gray-500">{d.created_at.slice(0, 10)}</td>
                      <td className="px-3 py-2">{d.file_path ? <OpenStorageFile bucket="documents" path={d.file_path} name={d.name} label="開く" /> : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
        <>
        <div className="flex items-center gap-1 mb-2.5">
          <FilterChip label="未選択" active={filter === 'unselected'} count={unselectedRows.length} onClick={() => setFilter('unselected')} />
          <FilterChip label="✓ 対象" active={filter === 'target'} count={targetRows.length} onClick={() => setFilter('target')} tone="target" />
          <FilterChip label="✗ 対象外" active={filter === 'exclude'} count={excludeRows.length} onClick={() => setFilter('exclude')} tone="exclude" />
          {filter === 'target' && (
            <span className="ml-3 text-[11.5px] text-gray-500">Wチェック済み <span className={`font-mono font-bold ${checkedCount === targetRows.length ? 'text-emerald-600' : 'text-amber-600'}`}>{checkedCount}</span> / {targetRows.length}</span>
          )}
        </div>
        <p className="text-[11.5px] text-gray-500 mb-2.5 leading-relaxed">
          一覧は「到着物と原本管理」タブの原本管理と同じ行です（契約時に預かった書類・届いた戸籍・手で足した原本）。手元の数がそのまま納品できる数で、出払い中（請求に同梱して戻っていない）の原本は対象にできません。<br />
          対象にした行で Wチェック（自分以外がハンコ）→ 全件済みで「納品完了」。押すと対象の原本は「返却・納品」に数が入って手元 0 になります。
          <span className="text-brand-700">名称セルは受領証に載せる名前に直せます。「権利証」を含む行は通知日と識別番号、「印鑑」を含む行は相続人を付けられます。</span>
        </p>

        {loading && rows.length === 0 ? (
          <div className="text-center py-8 text-[13px] text-gray-400">読み込み中...</div>
        ) : shownRows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-[13px] text-gray-400">
            {filter === 'unselected' && (rows.length === 0 ? '原本がありません（契約手続きの受領書類・受信簿の到着物から自動で並びます）' : '未選択の原本はありません（対象/対象外 全件選択済み）')}
            {filter === 'target' && '対象の原本はありません'}
            {filter === 'exclude' && '対象外の原本はありません'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[3px] border border-gray-200 bg-white">
            <table className="w-full text-[13px]" style={{ minWidth: 960 }}>
              <thead>
                <tr>
                  <th className="px-2 py-2 text-center font-medium w-10">No</th>
                  <th className="px-3 py-2 text-left font-medium">原本（クリックで受領証の名前を編集）</th>
                  <th className="px-2 py-2 text-right font-medium w-16">手元</th>
                  <th className="px-3 py-2 text-left font-medium w-44">受領のもと／出先</th>
                  <th className="px-3 py-2 text-left font-medium w-44">補足</th>
                  {filter === 'target' && heirs.length > 0 && <th className="px-3 py-2 text-left font-medium w-44">受領先<span className="block text-[10px] font-normal text-brand-700">未設定は全員に載せる</span></th>}
                  {filter === 'target' && <th className="px-3 py-2 text-center font-medium w-36">Wチェック</th>}
                  <th className="px-3 py-2 text-center font-medium w-44">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shownRows.map((r, i) => {
                  const editing = editingName[r.key] ?? null
                  const shownName = editing !== null ? editing : (r.displayName ?? r.name)
                  return (
                  <tr key={r.key} className="hover:bg-gray-50/60">
                    <td className="px-2 py-2.5 text-center text-[12px] font-mono text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 align-top">
                      <input type="text" value={shownName}
                        onChange={e => setEditingName(prev => ({ ...prev, [r.key]: e.target.value }))}
                        onBlur={e => commitDisplayName(r, e.target.value)}
                        placeholder={r.name}
                        title="原本受領証に載せる名前。空にすると元の名前に戻ります。"
                        className="w-full px-2 py-1 text-[13px] font-medium text-gray-800 bg-transparent border border-transparent hover:border-gray-200 focus:border-brand-500 focus:bg-white rounded outline-none transition-colors" />
                      {r.displayName && <div className="mt-0.5 pl-2 text-[10px] text-gray-400">元: {r.name}</div>}
                      {r.juryoshoIssuedOn && <div className="mt-0.5 pl-2 text-[10px] text-emerald-700">受領証 {md(r.juryoshoIssuedOn)} に載せた</div>}
                    </td>
                    <td className={`px-2 py-2.5 text-right text-[12px] font-mono align-top ${r.quantity > 0 ? 'text-gray-700' : 'text-red-600'}`}>{r.quantity} 通{r.delivered > 0 && <span className="block text-[10px] text-emerald-700 font-sans">納品済 {r.delivered}</span>}</td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-500 align-top">
                      <div>{r.stock.source}</div>
                      {r.outstanding > 0 && <div className="text-amber-700">出払い中 {r.outstanding}：{r.stock.outs.map(o => o.label).join('・')}</div>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isKenriRow(r) ? (
                        <button type="button" onClick={() => setToukiTarget(r)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${r.toukiNoticeDate || r.toukiNoticeNumber ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100' : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'}`}>
                          <FileText className="w-3 h-3" strokeWidth={2} />{r.toukiNoticeDate || r.toukiNoticeNumber ? '権利証補足 済' : '権利証補足'}
                        </button>
                      ) : isInkanRow(r) ? (
                        <button type="button" onClick={() => setInkanTarget(r)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${r.inkanClientNames && r.inkanClientNames.length > 0 ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100' : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'}`}>
                          <Users className="w-3 h-3" strokeWidth={2} />{r.inkanClientNames && r.inkanClientNames.length > 0 ? `相続人 ${r.inkanClientNames.length}名` : '相続人紐付'}
                        </button>
                      ) : <span className="text-[10px] text-gray-300 pl-1">—</span>}
                      {isKenriRow(r) && (r.toukiNoticeDate || r.toukiNoticeNumber) && (
                        <div className="mt-1 pl-1 text-[10px] text-purple-800 leading-snug">{r.toukiNoticeDate}{r.toukiNoticeDate && r.toukiNoticeNumber ? ' / ' : ''}{r.toukiNoticeNumber}</div>
                      )}
                      {isInkanRow(r) && r.inkanClientNames && r.inkanClientNames.length > 0 && (
                        <div className="mt-1 pl-1 text-[10px] text-purple-800 leading-snug">{r.inkanClientNames.join('、')}</div>
                      )}
                    </td>
                    {filter === 'target' && heirs.length > 0 && (
                      <td className="px-3 py-2 align-top">
                        <select value={r.recipientHeirId ?? ''} onChange={e => setRecipient(r, e.target.value)} disabled={saving === r.key}
                          className="w-full px-1.5 py-1 text-[11.5px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400">
                          <option value="">共通（全員）</option>
                          {heirs.map(h => <option key={h.id} value={h.id}>{h.name || '（氏名未入力）'}{h.is_client ? '（依頼者）' : ''}</option>)}
                        </select>
                        {r.recipientHeirId && (() => {
                          const addr = (heirs.find(h => h.id === r.recipientHeirId)?.address ?? '').trim()
                          return <div className={`mt-0.5 text-[10px] truncate ${addr ? 'text-gray-400' : 'text-red-600 font-semibold'}`} title={addr || '相続人一覧で住所を入れてください'}>{addr || '住所未登録（封筒を刷れません）'}</div>
                        })()}
                      </td>
                    )}
                    {filter === 'target' && (
                      <td className="px-3 py-2.5 text-center align-top">
                        {r.checkedAt ? (
                          <span className="inline-flex items-center gap-1 relative">
                            <HankoStamp name={r.checkedById ? memberNameById.get(r.checkedById) ?? null : null} at={r.checkedAt} size="sm" />
                            <button type="button" onClick={() => toggleCheck(r)} title="Wチェックを取消"
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                          </span>
                        ) : (
                          <button type="button" disabled={saving === r.key} onClick={() => toggleCheck(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50">
                            <UserCheck className="w-3 h-3" />未確認
                          </button>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center align-top">
                      {r.selection === null && (
                        <div className="inline-flex items-center gap-1">
                          <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'target')}
                            className="px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50">対象</button>
                          <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'exclude')}
                            className="px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold bg-white text-red-700 border border-red-300 hover:bg-red-50">対象外</button>
                        </div>
                      )}
                      {r.selection === 'target' && (
                        <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'exclude')}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold text-red-700 bg-white border border-red-300 hover:bg-red-50"><X className="w-3 h-3" strokeWidth={2.25} />対象外にする</button>
                      )}
                      {r.selection === 'exclude' && (
                        <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'target')}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50"><RotateCcw className="w-3 h-3" strokeWidth={2.25} />対象にする</button>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1">
          <Package className="w-3 h-3" strokeWidth={2} />「納品完了」を押すと 案件ステータスが 業務完了 → 納品完了 に変わり、対象の原本は原本管理で「納品済」になります。
        </p>
        </>
        )}
      </Section>

      {toukiTarget && (
        <ToukiNoticeModal row={toukiTarget} onClose={() => setToukiTarget(null)} onSave={(date, number) => saveToukiNotice(toukiTarget, date, number)} saving={saving === toukiTarget.key} />
      )}
      {inkanTarget && (
        <InkanClientsModal row={inkanTarget} heirs={heirs} onClose={() => setInkanTarget(null)} onSave={(names) => saveInkanClientNames(inkanTarget, names)} saving={saving === inkanTarget.key} />
      )}
      <GenponJuryoshoModal
        targetRecipients={targetRows.map(r => r.recipientHeirId)}
        linesFor={linesFor}
        onGenerated={id => void onJuryoshoGenerated(id)}
        isOpen={genponOpen}
        onClose={() => setGenponOpen(false)}
        caseData={caseData}
        heirs={heirs}
      />
      <EnvelopeDocumentModal isOpen={envelopeOpen} onClose={() => setEnvelopeOpen(false)} caseData={caseData} tasks={tasks} heirs={heirs} />
    </div>
  )
}

function FilterChip({ label, active, count, onClick, tone }: { label: string; active: boolean; count: number; onClick: () => void; tone?: 'target' | 'exclude' }) {
  const activeCls = tone === 'target' ? 'bg-emerald-600 text-white border-emerald-600' : tone === 'exclude' ? 'bg-red-600 text-white border-red-600' : 'bg-brand-600 text-white border-brand-600'
  const idleCls = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold border transition ${active ? activeCls : idleCls}`}>
      {label} <span className={`font-mono ${active ? 'opacity-90' : 'opacity-70'}`}>{count}</span>
    </button>
  )
}

// 権利証補足モーダル: 登記識別情報通知の 通知日 + 識別番号 手入力
function ToukiNoticeModal({ row, onClose, onSave, saving }: { row: DocRow; onClose: () => void; onSave: (date: string, number: string) => void; saving: boolean }) {
  const [date, setDate] = useState(row.toukiNoticeDate ?? '')
  const [num, setNum] = useState(row.toukiNoticeNumber ?? '')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold text-gray-900">権利証補足入力</div>
            <div className="text-[11.5px] text-gray-500 mt-0.5">{row.displayName ?? row.name}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[12px] text-gray-500 leading-relaxed">登記識別情報通知の <span className="font-semibold text-gray-700">通知日</span> と <span className="font-semibold text-gray-700">識別番号</span> を書面から手入力してください。原本受領証の該当行の下に自動でぶら下がります。</p>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">通知日</label>
            <input type="text" value={date} onChange={e => setDate(e.target.value)} placeholder="例: 令和8年7月9日受付" className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">識別番号</label>
            <input type="text" value={num} onChange={e => setNum(e.target.value)} placeholder="例: 第29003号" className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={() => onSave(date, num)} disabled={saving} className="px-5 py-2 text-[13px] font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// 印鑑証明書 相続人紐付モーダル: 相続人を複数選択(名前で保存)
function InkanClientsModal({ row, heirs, onClose, onSave, saving }: { row: DocRow; heirs: HeirRow[]; onClose: () => void; onSave: (names: string[]) => void; saving: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(row.inkanClientNames ?? []))
  const toggle = (name: string) => setSelected(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next })
  const orderedNames = heirs.map(h => h.name).filter(n => !!n)
  const extras = (row.inkanClientNames ?? []).filter(n => !orderedNames.includes(n))
  const all = [...orderedNames, ...extras]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold text-gray-900">相続人 紐付</div>
            <div className="text-[11.5px] text-gray-500 mt-0.5">{row.displayName ?? row.name}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[12px] text-gray-500 leading-relaxed">この書類が どの相続人分の 印鑑登録証明書か 選択してください。原本受領証には「（A様、B様、C様 各1通）」形式で列挙されます。</p>
          {all.length === 0 ? (
            <div className="text-center py-6 text-[12px] text-gray-400">相続人が登録されていません（相続人調査タブで登録してください）</div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-200">
              {all.map(name => (
                <label key={name} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} className="w-4 h-4 accent-brand-600" />
                  <span className="text-[13px] text-gray-800 flex-1">{name}</span>
                  {extras.includes(name) && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">相続人リスト外</span>}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <span className="text-[12px] text-gray-500">{selected.size} 名 選択中</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50">キャンセル</button>
            <button onClick={() => onSave([...selected])} disabled={saving} className="px-5 py-2 text-[13px] font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
