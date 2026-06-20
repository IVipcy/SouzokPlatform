'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  Section, FieldGrid, Field, InlineEdit, InlineSelect,
} from '@/components/ui/InlineFields'
import { SubTabs } from '@/components/ui/SubTabs'
import Button from '@/components/ui/Button'
import { Plus, Trash2, Pencil, RotateCcw } from 'lucide-react'
import { MAILING_DESTINATIONS } from '@/lib/constants'
import CaseClientsTable from './CaseClientsTable'
import type { CaseRow, ClientCommunicationRow, CaseClientRow } from '@/types'

type Props = {
  caseData: CaseRow
  clientCommunications: ClientCommunicationRow[]
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  onRefresh?: () => void
  // オーダーシート埋め込み時: やり取り履歴を隠し、各セクションを展開表示する
  orderSheetMode?: boolean
  // 依頼者（同行者含む・複数人）
  caseClients?: CaseClientRow[]
}

const TRAIT_OPTIONS: { key: 'smile' | 'neutral' | 'angry'; emoji: string; label: string }[] = [
  { key: 'smile',   emoji: '😊', label: '笑顔' },
  { key: 'neutral', emoji: '😐', label: '真顔' },
  { key: 'angry',   emoji: '😡', label: '怖い顔' },
]

const COMMUNICATION_TYPE_OPTIONS = ['進捗連絡', '書類依頼', '質問対応', 'クレーム対応', 'その他']

export default function ClientInfoTab({ caseData, clientCommunications, patchCase, patchClient, onRefresh, orderSheetMode = false, caseClients = [] }: Props) {
  const client = caseData.clients
  // 顧客郵送先（依頼者住所 / その他）。旧データ(case_client id 等)は依頼者住所として扱う。
  const mailingMode = caseData.mailing_destination === 'その他'
    ? 'その他'
    : (caseData.mailing_destination ? '依頼者住所' : '')

  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  const saveClientField = async (field: string, value: unknown) => {
    await patchClient({ [field]: value ?? null })
  }

  const [sub, setSub] = useState<'info' | 'history'>('info')

  // 依頼者情報（一覧・住所・郵送・特徴・クレーム）。アコーディオンをやめ常に開く。
  const infoSections = (
    <div className="space-y-3.5">
      {/* 0. 依頼者一覧（同行者含む・表形式） */}
      <Section title="依頼者一覧（同行者含む）">
        <CaseClientsTable caseId={caseData.id} clients={caseClients} onRefresh={onRefresh} clientId={caseData.client_id} />
      </Section>

      {/* 1. メイン依頼者の住所（書類・請求で使う正本。氏名/TEL/メール/連絡先希望/外字は上の表で管理） */}
      <Section title="メイン依頼者の住所">
        {caseData.client_id && client ? (
          <FieldGrid>
            <InlineEdit label="郵便番号" value={client.postal_code} onSave={v => saveClientField('postal_code', v.replace(/[^0-9]/g, ''))} />
            <InlineEdit label="依頼者住所" value={client.address} onSave={v => saveClientField('address', v)} fullWidth required />
          </FieldGrid>
        ) : (
          <p className="text-sm text-gray-400 italic py-2">依頼者未登録</p>
        )}
      </Section>

      {/* 2. 郵送・書類設定（顧客郵送先＝依頼者住所/その他。依頼者住所ならメイン依頼者の住所を自動表示） */}
      <Section title="郵送・書類設定">
        <FieldGrid>
          <InlineSelect
            label="顧客郵送先"
            value={mailingMode}
            options={[...MAILING_DESTINATIONS]}
            onSave={v => saveCaseField('mailing_destination', v)}
          />
          {mailingMode === '依頼者住所' ? (
            <Field label="郵送先住所（メイン依頼者・自動）" value={[client?.postal_code, client?.address].filter(Boolean).join('　') || '住所未登録（下のメイン依頼者の住所・連絡先で入力）'} />
          ) : mailingMode === 'その他' ? (
            <InlineEdit label="郵送先住所（その他）" value={caseData.mailing_address_other} onSave={v => saveCaseField('mailing_address_other', v)} fullWidth />
          ) : null}
        </FieldGrid>
      </Section>

      {/* 3. 依頼者特徴（常に展開） */}
      <Section title="依頼者特徴">
        <div className="space-y-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1.5">特徴</div>
            <div className="flex items-center gap-2">
              {TRAIT_OPTIONS.map(t => {
                const active = caseData.client_trait === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => saveCaseField('client_trait', active ? null : t.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] transition-all ${
                      active
                        ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold ring-2 ring-brand-200'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    title={active ? `${t.label}（クリックで解除）` : t.label}
                  >
                    <span className="text-[18px] leading-none">{t.emoji}</span>
                    <span>{t.label}</span>
                  </button>
                )
              })}
              {caseData.client_trait && (
                <button
                  type="button"
                  onClick={() => saveCaseField('client_trait', null)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 ml-1"
                >
                  クリア
                </button>
              )}
            </div>
          </div>
          <TextAreaField
            label="依頼者特徴詳細"
            value={caseData.client_trait_detail ?? ''}
            placeholder="例：この人はこういう性格だから、連絡はまめに取った方がいい。"
            onSave={v => saveCaseField('client_trait_detail', v || null)}
          />
        </div>
      </Section>

    </div>
  )

  // クレーム（やり取り履歴サブタブの先頭に表示。オーダーシート埋め込み時は出さない）
  const claimSection = (
    <Section title="クレーム">
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={caseData.has_complaint}
            onChange={e => saveCaseField('has_complaint', e.target.checked)}
            className="w-4 h-4 accent-purple-600 cursor-pointer"
          />
          <span className="text-[13px] font-semibold text-gray-700">クレーム有</span>
          {caseData.has_complaint && (
            <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              紫フラグ案件
            </span>
          )}
        </label>
        <TextAreaField
          label="クレーム内容"
          value={caseData.complaint_detail ?? ''}
          placeholder="クレームの内容を記載"
          onSave={v => saveCaseField('complaint_detail', v || null)}
          disabled={!caseData.has_complaint}
        />
      </div>
    </Section>
  )

  // オーダーシート埋め込み時はサブタブなし（やり取り履歴も非表示）
  if (orderSheetMode) return infoSections

  return (
    <div className="space-y-3.5">
      <SubTabs
        tabs={[{ key: 'info', label: '依頼者情報' }, { key: 'history', label: 'やり取り履歴' }]}
        active={sub}
        onChange={k => setSub(k as 'info' | 'history')}
      />
      {sub === 'info' && infoSections}
      {sub === 'history' && (
        <div className="space-y-3.5">
          {claimSection}
          <CommunicationsSection caseId={caseData.id} rows={clientCommunications} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  )
}

// ============ TextArea Field (inline-editable textarea) ============
function TextAreaField({ label, value, placeholder, onSave, disabled }: {
  label: string
  value: string
  placeholder?: string
  onSave: (value: string) => Promise<void>
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // 親側で値が変わった場合の同期
  if (!editing && draft !== value) {
    setDraft(value)
  }

  const commit = async () => {
    if (!editing) return
    setEditing(false)
    if (draft === value) return
    setSaving(true)
    await onSave(draft)
    setSaving(false)
  }

  return (
    <div>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">{label}</div>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        rows={3}
        placeholder={placeholder}
        disabled={disabled || saving}
        className={`w-full px-3 py-2 text-[13px] border rounded-lg outline-none resize-y transition-colors ${
          disabled
            ? 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed'
            : 'bg-white border-gray-200 hover:border-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
        }`}
      />
    </div>
  )
}

// ============ Communications Section ============
function CommunicationsSection({ caseId, rows, onRefresh }: {
  caseId: string
  rows: ClientCommunicationRow[]
  onRefresh?: () => void
}) {
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('client_communications').insert({
      case_id: caseId,
      communicated_at: today,
      communication_type: '進捗連絡',
      detail: '',
      status: 'お客様待ち',
    })
    setAdding(false)
    if (error) {
      showToast(`追加に失敗しました: ${error.message}`, 'error')
      return
    }
    onRefresh?.()
  }

  return (
    <Section
      title="やり取り履歴"
    >
      <div className="mb-3">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={handleAdd}
          loading={adding}
        >
          履歴を追加
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-gray-400 italic py-2">やり取り履歴はまだありません。「履歴を追加」から記録できます。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-brand-700">
                <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600" style={{ width: 130 }}>日付</th>
                <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600" style={{ width: 180 }}>連絡内容</th>
                <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600">やり取り詳細</th>
                <th className="px-2 py-1.5 text-center font-semibold text-white border border-brand-600" style={{ width: 130 }}>ステータス</th>
                <th className="px-2 py-1.5 text-center font-semibold text-white border border-brand-600" style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <CommunicationRow key={row.id} row={row} onRefresh={onRefresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function CommunicationRow({ row, onRefresh }: { row: ClientCommunicationRow; onRefresh?: () => void }) {
  const [editing, setEditing] = useState<{
    communicated_at: string
    communication_type: string
    detail: string
    status: 'お客様待ち' | '完了'
  }>({
    communicated_at: row.communicated_at,
    communication_type: row.communication_type,
    detail: row.detail ?? '',
    status: row.status,
  })

  // 連絡内容が5択に含まれない値（自由入力）の場合は自由入力モードでスタート
  const [typeMode, setTypeMode] = useState<'select' | 'free'>(
    COMMUNICATION_TYPE_OPTIONS.includes(row.communication_type) ? 'select' : 'free',
  )

  const save = async (patch: Partial<typeof editing>) => {
    const next = { ...editing, ...patch }
    setEditing(next)
    const supabase = createClient()
    const { error } = await supabase
      .from('client_communications')
      .update({
        communicated_at: next.communicated_at,
        communication_type: next.communication_type,
        detail: next.detail || null,
        status: next.status,
      })
      .eq('id', row.id)
    if (error) {
      showToast(`保存に失敗しました: ${error.message}`, 'error')
      return
    }
  }

  const handleDelete = async () => {
    if (!confirm('このやり取り履歴を削除しますか？')) return
    const supabase = createClient()
    const { error } = await supabase.from('client_communications').delete().eq('id', row.id)
    if (error) {
      showToast(`削除に失敗しました: ${error.message}`, 'error')
      return
    }
    onRefresh?.()
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50">
      <td className="px-2 py-1.5 border border-gray-200">
        <input
          type="date"
          value={editing.communicated_at}
          onChange={e => setEditing(p => ({ ...p, communicated_at: e.target.value }))}
          onBlur={e => save({ communicated_at: e.target.value })}
          className="w-full px-1.5 py-1 text-[12px] font-mono border border-gray-200 rounded outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
        />
      </td>
      <td className="px-2 py-1.5 border border-gray-200">
        {typeMode === 'select' ? (
          <div className="flex items-center gap-1">
            <select
              value={editing.communication_type}
              onChange={e => {
                if (e.target.value === '__free__') {
                  // 自由入力モードへ切替（値は維持して編集できるように）
                  setTypeMode('free')
                  return
                }
                const v = e.target.value
                setEditing(p => ({ ...p, communication_type: v }))
                save({ communication_type: v })
              }}
              className="flex-1 px-1.5 py-1 text-[13px] border border-gray-200 rounded outline-none bg-white focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            >
              {COMMUNICATION_TYPE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              <option value="__free__">— 自由入力に切替 —</option>
            </select>
            <button
              type="button"
              onClick={() => setTypeMode('free')}
              className="text-gray-400 hover:text-brand-600 p-1"
              title="自由入力モードに切替"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editing.communication_type}
              onChange={e => setEditing(p => ({ ...p, communication_type: e.target.value }))}
              onBlur={e => save({ communication_type: e.target.value })}
              placeholder="連絡内容を入力"
              className="flex-1 px-1.5 py-1 text-[13px] border border-gray-200 rounded outline-none bg-amber-50/40 focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
            <button
              type="button"
              onClick={() => {
                // 選択モードに戻す。現在値が5択に無い場合はデフォルト「進捗連絡」に戻す
                if (!COMMUNICATION_TYPE_OPTIONS.includes(editing.communication_type)) {
                  setEditing(p => ({ ...p, communication_type: '進捗連絡' }))
                  save({ communication_type: '進捗連絡' })
                }
                setTypeMode('select')
              }}
              className="text-gray-400 hover:text-brand-600 p-1"
              title="選択肢に戻す"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 border border-gray-200">
        <input
          type="text"
          value={editing.detail}
          onChange={e => setEditing(p => ({ ...p, detail: e.target.value }))}
          onBlur={e => save({ detail: e.target.value })}
          placeholder="やり取りの内容"
          className="w-full px-1.5 py-1 text-[13px] border border-gray-200 rounded outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
        />
      </td>
      <td className="px-2 py-1.5 border border-gray-200">
        <select
          value={editing.status}
          onChange={e => {
            const next = e.target.value as 'お客様待ち' | '完了'
            setEditing(p => ({ ...p, status: next }))
            save({ status: next })
          }}
          className={`w-full px-1.5 py-1 text-[12px] font-semibold border rounded outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200 ${
            editing.status === '完了'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          <option value="お客様待ち">お客様待ち</option>
          <option value="完了">完了</option>
        </select>
      </td>
      <td className="px-2 py-1.5 border border-gray-200 text-center">
        <button
          type="button"
          onClick={handleDelete}
          className="text-gray-300 hover:text-red-500 transition-colors p-1"
          title="削除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}
