'use client'

// 面談シート（面談時点の記録）。読み取り専用。
//
// 面談結果登録を保存した時点の内容をそのまま出す。あとからオーダーシートで直しても、ここは変わらない。
// 取り直したいときは面談結果登録をもう一度保存する。
// 「いまの内容を見る／直す」で、従来どおりの編集できる面談シートへ切り替えられる。

import { Lock } from 'lucide-react'
import type { MeetingSnapshot } from '@/lib/meetingSnapshot'

const S = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))
const yen = (v: unknown) => (typeof v === 'number' ? `¥${v.toLocaleString()}` : S(v))

function Row({ label, value }: { label: string; value: unknown }) {
  const v = S(value)
  return (
    <div className="flex gap-2 py-1 border-b border-gray-50 last:border-b-0">
      <span className="w-32 flex-none text-[12px] text-gray-500">{label}</span>
      <span className="flex-1 text-[13px] text-gray-800 whitespace-pre-wrap break-words">{v ?? <span className="text-gray-300">—</span>}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-[#1E3A8A]"><span className="text-[14px] font-bold text-white">{title}</span></div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function List({ rows, cols }: { rows: Record<string, unknown>[]; cols: { key: string; label: string; money?: boolean; fmt?: (v: unknown) => string | null }[] }) {
  if (rows.length === 0) return <p className="text-[12px] text-gray-400">なし</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
            {cols.map(c => <th key={c.key} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-b-0">
              {cols.map(c => <td key={c.key} className="px-2 py-1.5 text-gray-800">{(c.fmt ? c.fmt(r[c.key]) : c.money ? yen(r[c.key]) : S(r[c.key])) ?? <span className="text-gray-300">—</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MeetingSnapshotView({ snapshot, onEditLatest }: {
  snapshot: MeetingSnapshot
  /** 「いまの内容を見る／直す」を押したとき（従来の編集できる面談シートへ） */
  onEditLatest: () => void
}) {
  const c = snapshot.case
  const cl = snapshot.client
  const wc = (c.work_content ?? {}) as Record<string, string | null>
  const roles = (c.intake_roles ?? []) as Array<{ gyomu?: string | null }>
  const gyomus = [...new Set(roles.map(r => r.gyomu).filter(Boolean))].join('、')
  const at = snapshot.at ? snapshot.at.slice(0, 16).replace('T', ' ') : ''

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <Lock className="w-4 h-4 text-amber-700 flex-none" strokeWidth={2} />
        <span className="text-[12.5px] text-amber-900 flex-1 min-w-[220px] leading-snug">
          面談時点の記録です（{at} 時点）。あとからオーダーシートで直しても、ここは変わりません。
        </span>
        <button type="button" onClick={onEditLatest}
          className="flex-none text-[12px] font-semibold px-3 py-1.5 rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100">
          いまの内容を見る／直す
        </button>
      </div>

      <Section title="依頼者情報">
        <List rows={snapshot.caseClients} cols={[
          { key: 'priority', label: '区分', fmt: v => v === 'main' ? 'メイン依頼人' : v === 'companion' ? '同行者' : (v ? String(v) : null) }, { key: 'name', label: '氏名' }, { key: 'furigana', label: 'ふりがな' },
          { key: 'relationship', label: '続柄' }, { key: 'mobile_phone', label: '携帯' }, { key: 'phone', label: '固定' }, { key: 'email', label: 'メール' },
        ]} />
        <div className="mt-2">
          <Row label="住所" value={cl?.address} />
          <Row label="振込名義人（カナ）" value={cl?.transfer_name_kana} />
        </div>
        {wc.clientInfo && <p className="mt-2 text-[12.5px] text-gray-700 whitespace-pre-wrap">{wc.clientInfo}</p>}
      </Section>

      <Section title="提案内容・手続き内容">
        <Row label="受注区分" value={[c.service_category, c.service_category_2].filter(Boolean).join('／')} />
        <Row label="実施業務" value={gyomus} />
        <Row label="提案金額（司法）" value={c.proposal_judicial} />
        <Row label="提案金額（行政）" value={c.proposal_administrative} />
        <Row label="契約形態" value={c.contract_type} />
        <Row label="難易度" value={c.difficulty} />
        {wc.order && <p className="mt-2 text-[12.5px] text-gray-700 whitespace-pre-wrap">{wc.order}</p>}
      </Section>

      <Section title="相続人調査">
        <Row label="被相続人" value={c.deceased_name} />
        <Row label="ふりがな" value={c.deceased_furigana} />
        <Row label="生年月日" value={c.deceased_birth_date} />
        <Row label="相続開始日" value={c.date_of_death} />
        <Row label="住所" value={c.deceased_address} />
        <Row label="本籍" value={c.deceased_registered_address} />
        <div className="mt-2">
          <List rows={snapshot.heirs} cols={[
            { key: 'name', label: '氏名' }, { key: 'relationship_type', label: '続柄' },
            { key: 'address', label: '住所' }, { key: 'registered_address', label: '本籍' },
          ]} />
        </div>
        {wc.deceased && <p className="mt-2 text-[12.5px] text-gray-700 whitespace-pre-wrap">{wc.deceased}</p>}
      </Section>

      <Section title="財産調査">
        <div className="space-y-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">不動産</div>
            <List rows={snapshot.properties} cols={[
              { key: 'property_type', label: '種別' }, { key: 'address', label: '所在' }, { key: 'evaluation_amount', label: '評価額', money: true },
            ]} />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">金融資産</div>
            <List rows={snapshot.financialAssets} cols={[
              { key: 'asset_type', label: '種別' }, { key: 'institution_name', label: '金融機関' }, { key: 'balance', label: '残高', money: true },
            ]} />
          </div>
          {snapshot.otherAssets.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-gray-500 mb-1">その他財産・債務・費用</div>
              <List rows={snapshot.otherAssets} cols={[
                { key: 'kind', label: '区分' }, { key: 'name', label: '名称' }, { key: 'amount', label: '金額', money: true },
              ]} />
            </div>
          )}
        </div>
      </Section>

      {snapshot.referrals.length > 0 && (
        <Section title="他事業者紹介">
          <List rows={snapshot.referrals} cols={[{ key: 'partner_type', label: '種別' }, { key: 'content', label: '紹介内容' }]} />
        </Section>
      )}

      <Section title="ヒアリングメモ">
        <p className="text-[13px] text-gray-800 whitespace-pre-wrap">{S(c.meeting_hearing_memo) ?? <span className="text-gray-300">—</span>}</p>
      </Section>
    </div>
  )
}
