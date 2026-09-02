import { createClient } from '@/lib/supabase/client'

// 「戸籍が揃ったから、次はこれができる」を出すための判定。
//
// 前は完了モーダルに「案件にある着手前タスク」を全部並べていたが、
// タスクを先にまとめて作る運用をやめたので、そこはほぼ空になった。
// 代わりに出すのは、戸籍の完了に依存していて、いま実際に始められるものだけ。
//
// 依存の中身（戸籍請求タブの読込結果に入れた「被相続人との関係戸籍 取得完了」が起点）：
//   名寄せ請求   … 被相続人の最後の住所が分かっている＋その人の関係戸籍が揃った
//                  （または依頼者の関係戸籍が揃った）
//   資料請求     … 被相続人 または 依頼者の関係戸籍が揃った
//   凍結依頼     … 上に加えて、調査禁止で止まっていない＆まだ凍結していない
//
// 「調査禁止で止まっている」は禁止期間の話だけではない。お客様から
// 「まだ調べないで」と言われている口座（連絡待ち）も、OKの連絡が来るまでは出さない。

export type NextCandidate = {
  /** 重複を防ぐキー。そのままタスクの source_rid になる */
  rid: string
  /** 既定のタスク名。完了モーダルでその場で直せる */
  title: string
  /** 業務（タスクの phase／category） */
  gyomu: string
  /** なぜ今できるのか。着手OKの理由としてそのまま残す */
  why: string
}

/** 住所から「都道府県＋市区町村」を切り出す。不動産タブの市区町村タブと同じ切り方。 */
export function municipalityOfAddress(address: string | null | undefined): string {
  const a = (address ?? '').trim()
  if (!a) return ''
  const m = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
  return m ? `${m[1] ?? ''}${m[2]}` : ''
}

/** 調査禁止で止まっているか（指定あり＋期間内 or 連絡待ちで未解除）。 */
export function isSurveyOnHold(a: {
  survey_prohibited_designation?: string | null
  survey_prohibited_method?: string | null
  survey_prohibited_start?: string | null
  survey_prohibited_end?: string | null
  prohibition_released_at?: string | null
}, today = new Date().toISOString().slice(0, 10)): boolean {
  if ((a.survey_prohibited_designation ?? '') !== '指定あり') return false
  if (a.prohibition_released_at) return false          // お客様からOKの連絡が来ている
  if ((a.survey_prohibited_method ?? '') === '連絡待ち') return true
  // 期間指定。終了日を過ぎていれば解ける。開始日前は「まだ禁止に入っていない」ので止めない。
  const end = (a.survey_prohibited_end ?? '').trim()
  const start = (a.survey_prohibited_start ?? '').trim()
  if (!end && !start) return true                       // 指定ありなのに期間が空 → 安全側で止める
  if (end && today > end) return false
  if (start && today < start) return false
  return true
}

type LoadedCase = {
  deceasedName: string
  deceasedAddress: string
  /** 被相続人の関係戸籍が揃った */
  deceasedRelationDone: boolean
  /** 依頼者（相続人）の関係戸籍が揃った */
  clientRelationDone: boolean
}

/**
 * その案件で「いま新しく作れる、戸籍待ちだったタスク」を出す。
 * 既に同じ source_rid のタスクがあるものは出さない（二重に作らせない）。
 */
export async function loadNextCandidates(caseId: string): Promise<NextCandidate[]> {
  const supabase = createClient()
  const [{ data: c }, { data: ks }, { data: hs }, { data: props }, { data: fins }, { data: ts }] = await Promise.all([
    supabase.from('cases').select('deceased_name, deceased_address').eq('id', caseId).maybeSingle(),
    supabase.from('koseki_requests').select('target_person, relation_koseki_done').eq('case_id', caseId),
    supabase.from('heirs').select('name, is_client').eq('case_id', caseId),
    supabase.from('real_estate_properties').select('municipality, address').eq('case_id', caseId),
    supabase.from('financial_assets').select('institution_name, acquirer, freeze_confirmed, survey_prohibited_designation, survey_prohibited_method, survey_prohibited_start, survey_prohibited_end, prohibition_released_at').eq('case_id', caseId),
    supabase.from('tasks').select('source_rid').eq('case_id', caseId),
  ])

  const cs = c as { deceased_name: string | null; deceased_address: string | null } | null
  const kosekis = (ks ?? []) as Array<{ target_person: string | null; relation_koseki_done: boolean | null }>
  const heirs = (hs ?? []) as Array<{ name: string | null; is_client: boolean | null }>
  const clientNames = new Set(heirs.filter(h => h.is_client).map(h => (h.name ?? '').trim()).filter(Boolean))
  const deceasedName = (cs?.deceased_name ?? '').trim()

  const state: LoadedCase = {
    deceasedName,
    deceasedAddress: (cs?.deceased_address ?? '').trim(),
    deceasedRelationDone: kosekis.some(k => k.relation_koseki_done && (k.target_person ?? '').trim() === deceasedName && !!deceasedName),
    clientRelationDone: kosekis.some(k => k.relation_koseki_done && clientNames.has((k.target_person ?? '').trim())),
  }

  const have = new Set(((ts ?? []) as Array<{ source_rid: string | null }>).map(t => (t.source_rid ?? '')).filter(Boolean))
  const out: NextCandidate[] = []

  // ── 名寄せ請求（市区町村ごと） ──
  // 最後の住所が分かれば、その市区町村へ名寄帳を頼める。登録済みの物件がある市区町村も足す。
  const kosekiOkForMuni = (state.deceasedRelationDone && !!state.deceasedAddress) || state.clientRelationDone
  if (kosekiOkForMuni) {
    const munis = new Set<string>()
    const fromAddress = municipalityOfAddress(state.deceasedAddress)
    if (fromAddress) munis.add(fromAddress)
    for (const p of (props ?? []) as Array<{ municipality: string | null; address: string | null }>) {
      const m = (p.municipality ?? '').trim() || municipalityOfAddress(p.address)
      if (m) munis.add(m)
    }
    const why = state.deceasedRelationDone && fromAddress
      ? `被相続人の関係戸籍が揃い、最後の住所（${state.deceasedAddress}）が分かったため`
      : '依頼者の関係戸籍が揃ったため'
    for (const m of [...munis].sort((a, b) => a.localeCompare(b, 'ja'))) {
      const rid = `re-muni:${m}`
      if (have.has(rid)) continue
      out.push({ rid, title: `名寄帳・評価証明を請求：${m}`, gyomu: '不動産', why })
    }
  }

  // ── 金融機関ごと（資料請求・凍結依頼） ──
  const kosekiOkForFin = state.deceasedRelationDone || state.clientRelationDone
  if (kosekiOkForFin) {
    const why = state.deceasedRelationDone ? '被相続人の関係戸籍が揃ったため' : '依頼者の関係戸籍が揃ったため'
    type Fin = {
      institution_name: string | null; acquirer: string | null; freeze_confirmed: boolean | null
      survey_prohibited_designation: string | null; survey_prohibited_method: string | null
      survey_prohibited_start: string | null; survey_prohibited_end: string | null; prohibition_released_at: string | null
    }
    // 機関ごとにまとめる。1つでも止まっていない口座があれば、その機関は動かせる。
    const byInst = new Map<string, Fin[]>()
    for (const a of (fins ?? []) as Fin[]) {
      const nm = (a.institution_name ?? '').trim()
      if (!nm) continue
      byInst.set(nm, [...(byInst.get(nm) ?? []), a])
    }
    for (const [inst, accounts] of [...byInst].sort((a, b) => a[0].localeCompare(b[0], 'ja'))) {
      const usable = accounts.filter(a => !isSurveyOnHold(a))
      if (usable.length === 0) continue                       // 全部お客様の指定で止まっている
      const own = usable.some(a => (a.acquirer ?? '自社') !== '依頼者')
      if (own) {
        const rid = `fin:${inst}`
        if (!have.has(rid)) out.push({ rid, title: `資料請求（全店調査・残高・経過利息）：${inst}`, gyomu: '金融資産', why })
        // 凍結依頼は「銀行書類の手配」と同じ電話でやるので1本にまとめる（解約書類を別タスクにしない）。
        if (!usable.every(a => a.freeze_confirmed)) {
          const frid = `fin-freeze:${inst}`
          if (!have.has(frid)) out.push({ rid: frid, title: `凍結依頼・銀行書類手配：${inst}`, gyomu: '金融資産', why })
        }
      }
    }
  }

  return out
}
