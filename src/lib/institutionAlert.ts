/**
 * 金融機関のタスクを作るときの注意喚起。
 *
 * 金融機関マスタ（financialInstitutionMaster.ts）と案件の状況を突き合わせて、
 * 「いま作ろうとしている手続きは、まだ要件を満たしていない」ときだけ知らせる。
 * 止めはしない。マスタの戸籍要件は半分が「要確認」で、可否を機械が決めるほど
 * 確かではないため、人に見せて判断してもらう。
 *
 * 要件を満たしているときは何も出さない。毎回出すと、確認する必要がないときまで
 * ボタンを1回押すことになる。
 */

import { matchFinancialInstitution, type FinancialInstitution } from '@/lib/financialInstitutionMaster'

/** 案件の戸籍の進み具合。1件も無い＝これから請求する段階。 */
export type KosekiProgress = {
  total: number
  done: number       // 読込結果＝取得完了
  partial: number    // 読込結果＝一部不足
}

export type InstitutionAlertInput = {
  /** タスクの業務区分（解約 / 金融資産 など） */
  gyomu: string
  /** 対象の金融機関名（自由入力） */
  institutionName: string
  koseki: KosekiProgress
  /** 法定相続情報一覧図を取得済みか（cases.family_tree_obtain_date） */
  hasLegalInfo: boolean
  /** その金融機関の口座（凍結確認の判定に使う） */
  accounts: Array<{ freeze_confirmed?: boolean | null }>
}

export type InstitutionAlert = {
  institution: FinancialInstitution
  title: string
  /** 本文。1行ずつ出す */
  lines: string[]
}

/**
 * 戸籍が揃っているとみなせるか。
 * マスタ18行すべてで法定相続情報一覧図が戸籍の代わりになるので、
 * 一覧図があれば揃ったものとして扱う。無ければ全部の請求が取得完了であること。
 */
export function isKosekiReady(koseki: KosekiProgress, hasLegalInfo: boolean): boolean {
  if (hasLegalInfo) return true
  return koseki.total > 0 && koseki.done === koseki.total
}

/** 戸籍の状況を一言で（「3件中1件が一部不足」など） */
function kosekiText(k: KosekiProgress, hasLegalInfo: boolean): string {
  if (hasLegalInfo) return '法定相続情報一覧図は取得済みです。'
  if (k.total === 0) return 'この案件にはまだ戸籍請求が1件も登録されていません。'
  const rest = k.total - k.done
  const detail = k.partial > 0 ? `（うち${k.partial}件は一部不足）` : ''
  return `戸籍請求${k.total}件のうち${rest}件がまだ取得完了になっていません${detail}。法定相続情報一覧図も未取得です。`
}

export function buildInstitutionAlert(input: InstitutionAlertInput): InstitutionAlert | null {
  const gyomu = (input.gyomu ?? '').trim()
  if (gyomu !== '解約' && gyomu !== '金融資産') return null
  const inst = matchFinancialInstitution(input.institutionName)
  if (!inst) return null   // マスタに無い機関には口出ししない（誤った要件を出すほうが危ない）

  const ready = isKosekiReady(input.koseki, input.hasLegalInfo)
  const unfrozen = input.accounts.some(a => a.freeze_confirmed !== true)
  const lines: string[] = []

  if (gyomu === '解約') {
    if (!ready) {
      lines.push(`解約には${inst.cancel.level}の戸籍が必要です${inst.cancel.note ? `（${inst.cancel.note}）` : ''}。`)
      lines.push(kosekiText(input.koseki, input.hasLegalInfo))
      if (inst.legalInfoOk.startsWith('可')) {
        lines.push('法定相続情報一覧図があれば、戸籍の提出は不要になります。')
      }
    }
    if (input.accounts.length > 0 && unfrozen) {
      lines.push(`${inst.name}の口座がまだ凍結確認できていません。凍結前に解約を進めないでください。`)
    }
  } else {
    // 金融資産（残高証明など）。解約より要件が軽いので、戸籍が1件も揃っていないときだけ。
    if (input.koseki.done === 0 && !input.hasLegalInfo) {
      lines.push(`残高証明は${inst.balanceCert.level}の戸籍で請求できます${inst.balanceCert.note ? `（${inst.balanceCert.note}）` : ''}。`)
      lines.push(kosekiText(input.koseki, input.hasLegalInfo))
    }
  }

  if (lines.length === 0) return null
  return {
    institution: inst,
    title: `${inst.name}の${gyomu === '解約' ? '解約手続き' : '資料取得'} — 確認してください`,
    lines,
  }
}

/** タスク詳細に常時出す案内帯の中身。作業するときに手元にあると助かるものだけ。 */
export function institutionGuide(gyomu: string | null | undefined, institutionName: string | null | undefined) {
  const g = (gyomu ?? '').trim()
  if (g !== '解約' && g !== '金融資産') return null
  const inst = matchFinancialInstitution(institutionName)
  if (!inst) return null
  return {
    inst,
    items: [
      ['相続窓口', inst.counter],
      ['連絡先', inst.contact],
      ['所定様式', inst.formName],
      [g === '解約' ? '解約の戸籍要件' : '残高証明の戸籍要件',
        g === '解約'
          ? `${inst.cancel.level}${inst.cancel.note ? `（${inst.cancel.note}）` : ''}`
          : `${inst.balanceCert.level}${inst.balanceCert.note ? `（${inst.balanceCert.note}）` : ''}`],
      ['法定相続情報一覧図', inst.legalInfoOk],
      ['標準処理日数', inst.leadTime],
      ['送付先', inst.sendTo],
    ] as Array<[string, string]>,
  }
}
