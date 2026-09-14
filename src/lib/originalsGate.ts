// 原本の手元で決まる「この請求はいま出せるか」（原本ゲート）。
//
//   ・請求に要る原本（同梱する資料の一覧 REQUIRED_ENCLOSURES のうち gate=必須のもの）が
//     原本管理の手元に 1 通も無ければ「原本待ち」。着手OKにしない・完了モーダルの候補に出さない。
//   ・保存しない。開くたびに原本管理の数から計算する（原本が戻れば自動で解ける）。
//   ・対象は請求のタスク（source_rid が koseki:{id} / re-muni:{市区町村} / fin:{調査先}）。
//     読込（-read）・凍結（fin-freeze）などは対象外。
//
// サーバー／クライアント両方から使う（'use client' は付けない）。

import { REQUIRED_ENCLOSURES, matchStockForRequired, type RequiredEnclosure, type StockRow } from '@/lib/originals'
import type { TaskRow } from '@/types'

export type GateKind = 'koseki' | 're' | 'fin'

/** 請求の種類ごとの「これが無いと請求できない」原本 */
const GATE_KEYS: Record<GateKind, RequiredEnclosure['key'][]> = {
  koseki: ['poa'],
  re: ['poa', 'koseki_deceased'],
  fin: ['seal', 'poa', 'koseki_deceased'],
}
const GYOMU_OF: Record<GateKind, string> = { koseki: '戸籍', re: '不動産', fin: '金融資産' }

export type OriginalsGate = {
  ok: boolean
  /** 足りない原本（名前と、どこに出ているか） */
  missing: Array<{ name: string; outs: string[] }>
  /** 見た原本（揃っているものも含む） */
  checked: Array<{ name: string; onHand: number }>
}

/** source_rid から請求の種類。請求のタスクでなければ null */
export function gateKindOfRid(rid: string | null | undefined): GateKind | null {
  const r = rid ?? ''
  if (/^koseki:/.test(r)) return 'koseki'
  if (/^re-muni:/.test(r)) return 're'
  if (/^fin:/.test(r)) return 'fin'
  return null
}
export const gyomuOfGateKind = (k: GateKind) => GYOMU_OF[k]

/**
 * 原本ゲート。stock＝その案件の原本管理の行。
 * ctx.shokumujo … 戸籍の職務上請求（委任状は要らない）
 * ctx.ownQty … この請求が既に同梱している数（要る資料の名前 → 通数）。自分の分は「手元にある」と数える
 */
export function originalsGate(kind: GateKind, stock: StockRow[], ctx: { deceasedName?: string | null; shokumujo?: boolean; ownQty?: Record<string, number> }): OriginalsGate {
  const items = REQUIRED_ENCLOSURES[kind].filter(i => GATE_KEYS[kind].includes(i.key) && !(i.onlyWhen === 'not_shokumujo' && ctx.shokumujo))
  const missing: OriginalsGate['missing'] = []
  const checked: OriginalsGate['checked'] = []
  for (const item of items) {
    if (item.copy) continue
    const rows = stock.filter(s => matchStockForRequired(item, s, { deceasedName: ctx.deceasedName }))
    const onHand = rows.reduce((s, r) => s + r.onHand, 0) + (ctx.ownQty?.[item.name] ?? 0)
    checked.push({ name: item.name, onHand })
    if (onHand <= 0) {
      const outs = [...new Set(rows.flatMap(r => r.outs.map(o => o.label)))]
      missing.push({ name: item.name, outs })
    }
  }
  return { ok: missing.length === 0, missing, checked }
}

/** 足りない原本の一言（タスク一覧の注記・完了モーダルの理由） */
export function gateNote(g: OriginalsGate): string {
  return g.missing.map(m => `${m.name} 手元0${m.outs.length > 0 ? `（${m.outs.join('・')}に出払い中）` : ''}`).join('・')
}

/** 戻ってきた原本の名前から、要る資料のキー（受信簿の返却で「これで請求できるようになった」を探すのに使う） */
export function requiredKeysOfOriginalName(name: string): RequiredEnclosure['key'][] {
  const n = name
  const keys: RequiredEnclosure['key'][] = []
  if (n.includes('委任状')) keys.push('poa')
  if (n.includes('印鑑')) keys.push('seal')
  if (/戸籍|除籍|原戸籍/.test(n) && !/附票|住民票|除票/.test(n)) keys.push('koseki_deceased', 'koseki_heir', 'koseki_any')
  if (n.includes('法定相続情報')) keys.push('legal_info')
  return keys
}
/** その原本が戻ると解ける可能性のある請求の種類 */
export function gateKindsAffectedBy(originalName: string): GateKind[] {
  const keys = requiredKeysOfOriginalName(originalName)
  return (Object.keys(GATE_KEYS) as GateKind[]).filter(k => GATE_KEYS[k].some(x => keys.includes(x)))
}

/**
 * 着手前の請求タスクごとに「足りない原本」を出す。無いタスクは含めない。
 * stockByCase … 案件ID → 原本管理の行。ctxByCase … 案件ID → 被相続人名・戸籍請求の取得方法
 */
export function originalsWaitForTasks(
  tasks: Array<Pick<TaskRow, 'id' | 'case_id' | 'status' | 'source_rid'>>,
  stockByCase: Record<string, StockRow[]>,
  ctxByCase: Record<string, { deceasedName: string | null; kosekiAuthority?: Record<string, string | null> }>,
): Record<string, OriginalsGate> {
  const out: Record<string, OriginalsGate> = {}
  for (const t of tasks) {
    if (t.status !== '着手前' && t.status !== '未着手') continue
    const kind = gateKindOfRid(t.source_rid)
    if (!kind) continue
    const stock = stockByCase[t.case_id]
    const ctx = ctxByCase[t.case_id]
    if (!stock || !ctx) continue
    const shokumujo = kind === 'koseki' ? (ctx.kosekiAuthority?.[(t.source_rid ?? '').slice('koseki:'.length)] === '職務上請求') : false
    const g = originalsGate(kind, stock, { deceasedName: ctx.deceasedName, shokumujo })
    if (!g.ok) out[t.id] = g
  }
  return out
}
