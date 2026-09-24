'use client'

// 面談シート（面談時点の記録）。読み取り専用。
//
// 面談結果登録を保存した時点の内容をそのまま出す。あとからオーダーシートで直しても、ここは変わらない。
// 取り直したいときは面談結果登録をもう一度保存する。
// 「いまの内容を見る／直す」で、従来どおりの編集できる面談シートへ切り替えられる。
//
// 見た目はオーダーシートの型：角丸なしの大セクション（ベージュの外枠・青い見出し帯・白い中身）、
// 先頭に「作業内容・関連情報」（面談シートのメモ）、その下は「｜青い縦線＋太字」の小見出しで区切る。
// 項目名セルの2列表（FieldGrid）と一覧表の列並びは面談シートと同じ。違いは入力欄が文字になっていることと鍵だけ。

import { Lock } from 'lucide-react'
import { FieldGrid, FieldRow } from '@/components/ui/InlineFields'
import { getCaseStatusLabel } from '@/lib/constants'
import { formatPhone } from '@/lib/phone'
import type { MeetingSnapshot } from '@/lib/meetingSnapshot'

type Rec = Record<string, unknown>
const S = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))
const yen = (v: unknown) => (typeof v === 'number' ? `¥${v.toLocaleString()}` : S(v))
const zip = (v: unknown) => { const d = S(v)?.replace(/[^0-9]/g, '') ?? ''; return d.length === 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : S(v) }
const Empty = () => <span className="text-gray-300">—</span>

/** 項目名セル＋値（面談シートの InlineEdit と同じ枠に、値だけを出す） */
function V({ label, value, fullWidth, mono }: { label: string; value: unknown; fullWidth?: boolean; mono?: boolean }) {
  const v = S(value)
  return (
    <FieldRow label={label} fullWidth={fullWidth}>
      <div className={`text-[14px] text-gray-800 whitespace-pre-wrap break-words ${mono ? 'font-mono' : ''}`}>{v ?? <Empty />}</div>
    </FieldRow>
  )
}

/** 大セクション。オーダーシートの OSSection と同じ（角丸なし・ベージュ外枠・青い帯・白い中身）＋鍵 */
function OSSection({ title, badge, memo, children }: { title: string; badge?: string | null; memo?: string | null; children: React.ReactNode }) {
  return (
    <section className="bg-[#FEF8EA]">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-600">
        <h2 className="text-[14px] font-bold text-white tracking-[0.02em] flex-1">{title}</h2>
        {badge && <span className="text-[10px] text-white bg-white/22 rounded-full px-1.5 py-0.5">{badge}</span>}
        <Lock className="w-3.5 h-3.5 text-white/80" strokeWidth={2} />
      </div>
      <div className="p-4 space-y-4 bg-white">
        {/* 作業内容・関連情報（＝面談シートのこのセクションのメモ）。オーダーシートと同じ先頭位置 */}
        {memo && (
          <div className="pb-3 border-b border-gray-100">
            <div className="text-[11.5px] text-gray-500 mb-1">作業内容・関連情報（面談シートのメモ）</div>
            <p className="text-[13px] text-gray-800 whitespace-pre-wrap bg-[#f3f5f8] px-2.5 py-2">{memo}</p>
          </div>
        )}
        {children}
      </div>
    </section>
  )
}

/** 小見出しブロック。オーダーシート内の Section（nested）と同じ「｜青い縦線＋13.5px 太字」＋インデント */
function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && (
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block w-[3px] h-3.5 bg-brand-600 flex-shrink-0" />
          <h3 className="text-[13.5px] font-semibold text-gray-700">{title}</h3>
        </div>
      )}
      <div className={title ? 'pl-[11px]' : ''}>{children}</div>
    </div>
  )
}

type Col = { key: string; label: string; money?: boolean; right?: boolean; width?: string; fmt?: (v: unknown, row: Rec) => string | null }
/** 一覧表。面談シートの依頼者一覧・相続人一覧と同じ見出し帯 */
function Table({ rows, cols, emptyText = 'なし' }: { rows: Rec[]; cols: Col[]; emptyText?: string }) {
  if (rows.length === 0) return <p className="text-[12.5px] text-gray-400">{emptyText}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600 tracking-[0.04em]">
            {cols.map(c => <th key={c.key} style={c.width ? { width: c.width, minWidth: c.width } : undefined} className={`px-2 py-2 font-semibold whitespace-nowrap ${c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={(r.id as string) ?? i} className="border-b border-gray-100 last:border-b-0">
              {cols.map(c => {
                const v = c.fmt ? c.fmt(r[c.key], r) : c.money ? yen(r[c.key]) : S(r[c.key])
                return <td key={c.key} className={`px-2 py-1.5 text-gray-800 align-top ${c.right ? 'text-right tabular-nums' : ''}`}>{v ?? <Empty />}</td>
              })}
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
  const fin = snapshot.financialAssets
  const deposits = fin.filter(a => a.asset_type === '預貯金')
  const securities = fin.filter(a => a.asset_type === '証券' || a.asset_type === '信託' || a.asset_type === '信託銀行')
  const insurance = fin.filter(a => a.asset_type === '生命保険')
  const estimates = snapshot.assetEstimates ?? []
  const status = S(c.status)
  const yesNo = (v: unknown) => (v === true ? '✓' : null)

  return (
    <div className="space-y-5">
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

      <OSSection title="依頼者情報" memo={wc.clientInfo}>
        <Block title="依頼者一覧">
          <Table rows={snapshot.caseClients} emptyText="依頼者が登録されていません" cols={[
            { key: 'priority', label: '優先度', width: '7rem', fmt: v => v === 'main' ? 'メイン依頼人' : v === 'companion' ? '同行者' : S(v) },
            { key: 'name', label: '氏名' }, { key: 'furigana', label: 'ふりがな' }, { key: 'relationship', label: '続柄', width: '5rem' },
            { key: 'mobile_phone', label: 'TEL（携帯）', width: '8.5rem', fmt: v => formatPhone(S(v)) || null },
            { key: 'phone', label: 'TEL（固定）', width: '8.5rem', fmt: v => formatPhone(S(v)) || null },
            { key: 'email', label: 'メール' },
            { key: 'preferred_contact', label: '連絡先希望', fmt: v => Array.isArray(v) && v.length ? v.join('・') : null },
            { key: 'has_special_chars', label: '外字', width: '3.5rem', fmt: yesNo },
          ]} />
        </Block>
        <Block title="メイン依頼者の住所・振込名義">
          {/* 住所の型（全画面共通）：郵便番号 → 住所1 → 住所2 */}
          <FieldGrid>
            <V label="郵便番号" value={zip(cl?.postal_code)} mono />
            <V label="振込名義人（カナ）" value={cl?.transfer_name_kana} mono />
            <V label="住所1（都道府県〜番地まで）" value={cl?.address} fullWidth />
            <V label="住所2（建物名・部屋番号）" value={cl?.address2} fullWidth />
          </FieldGrid>
        </Block>
      </OSSection>

      <OSSection title="提案内容・手続き内容" memo={wc.order}>
        <Block title="受注内容">
          <FieldGrid>
            <V label="受注区分" value={[c.service_category, c.service_category_2].filter(Boolean).join('／')} />
            <V label="契約形態" value={c.contract_type} />
            <V label="実施業務" value={gyomus} fullWidth />
            <V label="提案金額（行政）" value={c.proposal_administrative} mono />
            <V label="提案金額（司法）" value={c.proposal_judicial} mono />
          </FieldGrid>
        </Block>
        <Block title="面談結果">
          <FieldGrid>
            <V label="面談結果" value={status ? getCaseStatusLabel(status) : null} />
            <V label="受注の獲得区分" value={c.order_win_type} />
            <V label="検討中・失注理由" value={[c.consideration_decline_reason, c.consideration_decline_reason_detail].filter(Boolean).join('：')} fullWidth />
            <V label="検討期間" value={c.consideration_period} />
            <V label="見込み度合い" value={c.prospect_level} />
            <V label="お客様回答予定日" value={c.client_response_due_date} mono />
            <V label="完了予定日" value={c.expected_completion_date} mono />
            <V label="難易度" value={c.difficulty} />
            <V label="依頼者の特徴" value={[c.client_trait, c.client_trait_detail].filter(Boolean).join('／')} />
          </FieldGrid>
        </Block>
      </OSSection>

      <OSSection title="相続人調査" memo={wc.deceased}>
        <Block title="被相続人情報">
          <FieldGrid>
            <V label="被相続人氏名" value={c.deceased_name} />
            <V label="被相続人ふりがな" value={c.deceased_furigana} />
            <V label="被相続人生年月日" value={c.deceased_birth_date} mono />
            <V label="相続開始日（死亡日）" value={c.date_of_death} mono />
            <V label="住所1（都道府県〜番地まで）" value={c.deceased_address} fullWidth />
            <V label="住所2（建物名・部屋番号）" value={c.deceased_address2} fullWidth />
            <V label="被相続人本籍" value={c.deceased_registered_address} fullWidth />
          </FieldGrid>
        </Block>
        <Block title="相続人一覧">
          <Table rows={snapshot.heirs} emptyText="相続人が登録されていません" cols={[
            { key: 'name', label: '氏名' }, { key: 'relationship_type', label: '続柄', width: '6rem', fmt: (v, r) => S(v) ?? S(r.relationship) },
            { key: 'address', label: '住所1（都道府県〜番地）' }, { key: 'address2', label: '住所2（建物名・部屋番号）' },
            { key: 'is_client', label: '依頼者', width: '4rem', fmt: yesNo }, { key: 'is_deceased', label: '死亡', width: '4rem', fmt: yesNo },
          ]} />
        </Block>
      </OSSection>

      {estimates.length > 0 && (
        <OSSection title="資産概算（調査開始前）" badge={typeof c.total_asset_estimate === 'number' ? `合計 ${yen(c.total_asset_estimate)}` : null}>
          <Block>
            <Table rows={estimates} cols={[{ key: 'kind', label: '区分', width: '9rem' }, { key: 'amount', label: '金額', money: true, right: true, width: '10rem' }, { key: 'note', label: 'メモ' }]} />
          </Block>
        </OSSection>
      )}

      <OSSection title="財産調査（不動産）" memo={wc.assets_re}>
        <Block title="不動産一覧">
          <Table rows={snapshot.properties} emptyText="不動産の登録はありません" cols={[
            { key: 'property_type', label: '物件種別', width: '6rem' }, { key: 'address', label: '所在地' }, { key: 'lot_number', label: '地番・家屋番号', fmt: (v, r) => S(v) ?? S(r.kaoku_bango) }, { key: 'notes', label: '備考' },
          ]} />
        </Block>
      </OSSection>

      <OSSection title="財産調査（預金）" memo={wc.assets_deposit}>
        <Block title="預金口座">
          <Table rows={deposits} emptyText="預金口座の登録はありません" cols={[
            { key: 'institution_name', label: '金融機関名' }, { key: 'branch_name', label: '支店' }, { key: 'account_type', label: '口座種別', width: '6rem' }, { key: 'account_number', label: '口座番号', width: '9rem' }, { key: 'notes', label: '備考' },
          ]} />
        </Block>
      </OSSection>

      {securities.length > 0 && (
        <OSSection title="財産調査（証券・信託）" memo={wc.assets_securities}>
          <Block>
            <Table rows={securities} cols={[{ key: 'asset_type', label: '種別', width: '6rem' }, { key: 'institution_name', label: '金融機関名' }, { key: 'notes', label: '備考' }]} />
          </Block>
        </OSSection>
      )}

      {insurance.length > 0 && (
        <OSSection title="財産調査（生命保険）" memo={wc.assets_insurance}>
          <Block>
            <Table rows={insurance} cols={[{ key: 'institution_name', label: '保険会社名' }, { key: 'notes', label: '備考（受取人・保険金など）' }]} />
          </Block>
        </OSSection>
      )}

      {snapshot.otherAssets.length > 0 && (
        <OSSection title="その他財産・相続債務・その他費用">
          <Block>
            <Table rows={snapshot.otherAssets} cols={[{ key: 'kind', label: '区分', width: '8rem' }, { key: 'name', label: '名称' }, { key: 'amount', label: '金額', money: true, right: true, width: '10rem' }, { key: 'notes', label: '備考' }]} />
          </Block>
        </OSSection>
      )}

      {(snapshot.referrals.length > 0 || S(c.tax_filing_required)) && (
        <OSSection title="他事業者紹介" memo={wc.referral}>
          <Block title="税理士紹介">
            <FieldGrid>
              <V label="相続税申告要否" value={c.tax_filing_required} />
            </FieldGrid>
          </Block>
          <Block title="紹介先">
            <Table rows={snapshot.referrals} emptyText="紹介はありません" cols={[
              { key: 'partner_type', label: '紹介先の種別', width: '7rem' }, { key: 'firm_name', label: '紹介先' }, { key: 'referral_reason', label: '紹介理由' },
              { key: 'appraisal_rank', label: '査定ランク', width: '6rem' }, { key: 'content', label: '依頼内容' }, { key: 'content_detail', label: '備考' },
            ]} />
          </Block>
        </OSSection>
      )}

      {(S(c.meeting_hearing_memo) || S(c.meeting_other_notes)) && (
        <OSSection title="ヒアリング内容・申し送り">
          <Block>
            <FieldGrid cols={1}>
              <V label="ヒアリング内容メモ" value={c.meeting_hearing_memo} fullWidth />
              <V label="その他申し送り事項" value={c.meeting_other_notes} fullWidth />
            </FieldGrid>
          </Block>
        </OSSection>
      )}
    </div>
  )
}
