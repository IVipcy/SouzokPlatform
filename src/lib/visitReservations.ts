// 来店予約一覧（migration 289）。
// Google スプレッドシート（来店カレンダー）を CSV で読み、案件名・案件番号・依頼者名・金融機関名・来店日の行にする。
//   ・シートは「リンクを知っている全員が閲覧可」にしてもらう（API キーは使わない）
//   ・列は見出し行の文字で自動で見つける。合わないときは設定で見出しの文字か列記号（A・B…）を指定できる
//   ・「来店準備完了」を押した行は visit_reservations_done に鍵で覚え、一覧から消す
// サーバーでだけ使う（fetch は CORS を避けてサーバーから）。

import type { SupabaseClient } from '@supabase/supabase-js'

export const VISITS_SHEET_URL_KEY = 'visits_sheet_url'
export const VISITS_COLUMNS_KEY = 'visits_columns'

export type VisitColumnKey = 'case_name' | 'case_number' | 'client_name' | 'bank' | 'visit_date'
export const VISIT_COLUMNS: Array<{ key: VisitColumnKey; label: string; hints: string[] }> = [
  { key: 'case_name', label: '案件名', hints: ['案件名'] },
  { key: 'case_number', label: '案件番号', hints: ['案件管理番号', '案件番号', '管理番号', '案件no', '案件№'] },
  { key: 'client_name', label: '依頼者名', hints: ['依頼者名', '依頼者', 'お客様名', '顧客名'] },
  { key: 'bank', label: '金融機関名', hints: ['金融機関名', '金融機関', '銀行名', '銀行', '証券会社', '来店先'] },
  { key: 'visit_date', label: '来店日', hints: ['来店日', '来店日時', '来店', '予約日', '日付'] },
]
export type VisitColumns = Partial<Record<VisitColumnKey, string>>

export type VisitRow = {
  /** 一覧から消すときの鍵（シートの内容から作る） */
  key: string
  caseName: string
  caseNumber: string
  clientName: string
  bank: string
  visitDate: string
  /** 並べ替え用（YYYY-MM-DD。読めなければ空） */
  visitDateIso: string
  /** 案件番号／LP番号で見つけた案件 */
  caseId: string | null
  dealName: string | null
}

export type VisitData = {
  configured: boolean
  sheetUrl: string
  csvUrl: string
  columns: VisitColumns
  /** 見出し行（設定画面の候補に出す） */
  headers: string[]
  /** 自動で見つけた列（見出しの文字） */
  detected: Partial<Record<VisitColumnKey, string>>
  rows: VisitRow[]
  error: string | null
}

const norm = (s: string) => s.normalize('NFKC').replace(/[\s　]/g, '').toLowerCase()

/** シートの URL（編集画面のもの／公開のもの）を CSV の URL にする */
export function toCsvUrl(url: string): string {
  const u = url.trim()
  if (!u) return ''
  if (/[?&]output=csv/.test(u) || /\/export\?/.test(u)) return u
  const m = u.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)
  if (!m) return u
  const gid = u.match(/[#?&]gid=(\d+)/)?.[1] ?? '0'
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`
}

/** CSV（RFC4180。引用符・改行入りのセルも可） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
      continue
    }
    if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

/** 「2026/9/25」「9/25」「2026-09-25」「9月25日」→ YYYY-MM-DD（年が無ければ今年。読めなければ空） */
export function toIsoDate(raw: string, today: string): string {
  const s = raw.normalize('NFKC').trim()
  let m = s.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/(\d{1,2})[\/\-.月](\d{1,2})/)
  if (m) return `${today.slice(0, 4)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return ''
}

const colIndexOfLetter = (v: string): number | null => {
  const t = v.trim().toUpperCase()
  if (!/^[A-Z]{1,2}$/.test(t)) return null
  let n = 0
  for (const ch of t) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** 見出し行を探し、各項目の列番号を決める */
export function resolveColumns(table: string[][], setting: VisitColumns): { headerRow: number; idx: Partial<Record<VisitColumnKey, number>>; headers: string[]; detected: Partial<Record<VisitColumnKey, string>> } {
  let best = { row: 0, score: -1 }
  for (let r = 0; r < Math.min(table.length, 15); r++) {
    const cells = table[r].map(norm)
    let score = 0
    for (const c of VISIT_COLUMNS) if (cells.some(x => c.hints.some(h => x.includes(norm(h))))) score++
    if (score > best.score) best = { row: r, score }
  }
  const headerRow = best.score >= 2 ? best.row : 0
  const headers = table[headerRow] ?? []
  const normHeaders = headers.map(norm)
  const idx: Partial<Record<VisitColumnKey, number>> = {}
  const detected: Partial<Record<VisitColumnKey, string>> = {}
  for (const c of VISIT_COLUMNS) {
    const s = (setting[c.key] ?? '').trim()
    if (s) {
      const li = colIndexOfLetter(s)
      if (li != null) { idx[c.key] = li; continue }
      const hi = normHeaders.findIndex(h => h === norm(s)) >= 0 ? normHeaders.findIndex(h => h === norm(s)) : normHeaders.findIndex(h => h.includes(norm(s)))
      if (hi >= 0) { idx[c.key] = hi; continue }
    }
    // 自動：見出しの文字で。完全一致 → 含む の順に
    let hi = -1
    for (const h of c.hints) { hi = normHeaders.findIndex(x => x === norm(h)); if (hi >= 0) break }
    if (hi < 0) for (const h of c.hints) { hi = normHeaders.findIndex(x => x.includes(norm(h))); if (hi >= 0) break }
    if (hi >= 0) { idx[c.key] = hi; detected[c.key] = headers[hi] }
  }
  return { headerRow, idx, headers, detected }
}

export const visitRowKey = (r: { caseNumber: string; clientName: string; bank: string; visitDate: string }) =>
  [r.caseNumber, r.clientName, r.bank, r.visitDate].map(v => norm(v)).join('|')

/**
 * 行ごとの鍵。同じ銀行・同じ日に2枠あると鍵が同じになり、片方を完了すると両方消えていたので、
 * 同じ内容の2行目以降には「#2」「#3」を付けて区別する（1行目は従来どおりの鍵＝過去の完了記録と互換）。
 */
export function visitRowKeys(rows: Array<{ caseNumber: string; clientName: string; bank: string; visitDate: string }>): string[] {
  const seen = new Map<string, number>()
  return rows.map(r => {
    const base = visitRowKey(r)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}#${n}`
  })
}

/** 読みに行ってよい URL か。app_settings に入った URL を無条件に取りに行くと、社内アドレス等を読まされるため docs.google.com のシートだけに限る */
export function isAllowedSheetUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'docs.google.com' && u.pathname.startsWith('/spreadsheets/')
  } catch { return false }
}

export async function loadVisitReservations(supabase: SupabaseClient, today: string): Promise<VisitData> {
  const empty: VisitData = { configured: false, sheetUrl: '', csvUrl: '', columns: {}, headers: [], detected: {}, rows: [], error: null }
  const { data: st, error: stErr } = await supabase.from('app_settings').select('key, value').in('key', [VISITS_SHEET_URL_KEY, VISITS_COLUMNS_KEY])
  if (stErr) return { ...empty, error: `設定を読めませんでした（migration 289 が未適用の可能性）: ${stErr.message}` }
  const settings = new Map(((st ?? []) as Array<{ key: string; value: string | null }>).map(r => [r.key, r.value ?? '']))
  const sheetUrl = (settings.get(VISITS_SHEET_URL_KEY) ?? '').trim()
  let columns: VisitColumns = {}
  try { columns = JSON.parse(settings.get(VISITS_COLUMNS_KEY) || '{}') as VisitColumns } catch { columns = {} }
  if (!sheetUrl) return { ...empty, columns }
  const csvUrl = toCsvUrl(sheetUrl)
  if (!isAllowedSheetUrl(csvUrl)) {
    return { ...empty, configured: true, sheetUrl, csvUrl, columns, error: '来店予約のシートURLは docs.google.com のスプレッドシートだけ使えます。右上の「設定」で直してください' }
  }
  let text = ''
  try {
    // 5秒で諦める。シートが重いとき事務管理ダッシュボード全体が待たされるため
    const res = await fetch(csvUrl, { cache: 'no-store', redirect: 'follow', headers: { Accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(5000) })
    const ct = res.headers.get('content-type') ?? ''
    if (!res.ok || ct.includes('text/html')) {
      return { ...empty, configured: true, sheetUrl, csvUrl, columns, error: res.status === 200 || res.status === 302 || res.status === 401 || res.status === 403
        ? 'シートを読めませんでした。シートの共有を「リンクを知っている全員が閲覧可」にしてください'
        : `シートを読めませんでした（HTTP ${res.status}）` }
    }
    text = await res.text()
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { ...empty, configured: true, sheetUrl, csvUrl, columns, error: timedOut ? 'シートの読み込みが5秒たっても終わりませんでした。しばらくしてから開き直してください' : `シートを読めませんでした: ${e instanceof Error ? e.message : ''}` }
  }
  const table = parseCsv(text)
  const { headerRow, idx, headers, detected } = resolveColumns(table, columns)
  const missing = VISIT_COLUMNS.filter(c => idx[c.key] == null && c.key !== 'case_name')
  if (missing.length > 0) {
    return { ...empty, configured: true, sheetUrl, csvUrl, columns, headers, detected, error: `列が見つかりません：${missing.map(c => c.label).join('・')}。右上の「設定」で見出しの文字か列記号を指定してください` }
  }
  const cell = (row: string[], k: VisitColumnKey) => (idx[k] != null ? (row[idx[k]!] ?? '').trim() : '')
  const raw = table.slice(headerRow + 1).map(row => ({
    caseName: cell(row, 'case_name'), caseNumber: cell(row, 'case_number'), clientName: cell(row, 'client_name'), bank: cell(row, 'bank'), visitDate: cell(row, 'visit_date'),
  })).filter(r => r.bank || r.caseNumber || r.visitDate)

  // 「来店準備完了」を押した行を除く
  const keys = visitRowKeys(raw)
  const { data: done } = keys.length ? await supabase.from('visit_reservations_done').select('row_key').in('row_key', keys) : { data: [] }
  const doneSet = new Set(((done ?? []) as Array<{ row_key: string }>).map(d => d.row_key))

  // 案件番号／LP番号で案件を引く
  const numbers = [...new Set(raw.map(r => r.caseNumber.normalize('NFKC').trim()).filter(Boolean))]
  const caseByNumber = new Map<string, { id: string; deal_name: string }>()
  if (numbers.length > 0) {
    const [a, b] = await Promise.all([
      supabase.from('cases').select('id, case_number, deal_name').in('case_number', numbers),
      supabase.from('cases').select('id, lp_case_number, deal_name').in('lp_case_number', numbers),
    ])
    for (const c of (a.data ?? []) as Array<{ id: string; case_number: string; deal_name: string }>) caseByNumber.set(c.case_number, { id: c.id, deal_name: c.deal_name })
    for (const c of (b.data ?? []) as Array<{ id: string; lp_case_number: string; deal_name: string }>) if (!caseByNumber.has(c.lp_case_number)) caseByNumber.set(c.lp_case_number, { id: c.id, deal_name: c.deal_name })
  }
  const rows: VisitRow[] = raw.map((r, i) => {
    const c = caseByNumber.get(r.caseNumber.normalize('NFKC').trim()) ?? null
    return { key: keys[i], ...r, visitDateIso: toIsoDate(r.visitDate, today), caseId: c?.id ?? null, dealName: c?.deal_name ?? null }
  }).filter(r => !doneSet.has(r.key))
  rows.sort((a, b) => (a.visitDateIso || '9999').localeCompare(b.visitDateIso || '9999') || a.bank.localeCompare(b.bank, 'ja'))
  return { configured: true, sheetUrl, csvUrl, columns, headers, detected, rows, error: null }
}
