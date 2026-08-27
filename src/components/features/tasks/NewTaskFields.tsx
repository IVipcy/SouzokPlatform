'use client'

// タスクを手で作るときの入力欄。
//
// 「タスク追加」モーダルの新規作成タブと、タスク完了モーダルの
// 「候補に無い → タスクを追加」で同じものを使う。
// 前は完了モーダル側だけ項目が少なく（区分2つとタスク名だけ）、
// あとから業務や期限を入れ直す手間になっていた。

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { gyomuForCategories, GYOMU_ALL } from '@/lib/serviceMaster'
import { partsForCase, activePartKeys } from '@/lib/serviceParts'
import { isHiddenForAssistant } from '@/lib/assistantTaskTabs'
import { koteiOf } from '@/lib/kotei'

/** 担当区分。事務管理＝業務ひもづきの通常タスク。管理担当/受注担当＝systemタスクで、その担当へ割当＋通知。 */
export type RoleKind = 'assistant' | 'manager' | 'sales'

export type NewTaskValue = {
  roleKind: RoleKind
  gyomu: string
  title: string
  work: string
  dueDate: string
  priority: string
  /** 外出して行う作業（役所回り等）。事務管理タスク一覧で絞り込める */
  outing: boolean
}

export const emptyNewTask = (): NewTaskValue => ({
  roleKind: 'assistant', gyomu: '', title: '', work: '', dueDate: '', priority: '通常', outing: false,
})

const ROLE_KINDS: { key: RoleKind; label: string; desc: string }[] = [
  { key: 'assistant', label: '事務管理担当タスク', desc: '業務にひもづく通常タスク（既定）' },
  { key: 'manager', label: '管理担当タスク', desc: '案件の管理担当へ割当・通知' },
  { key: 'sales', label: '受注担当タスク', desc: '案件の受注担当へ割当・通知' },
]

const PRIORITIES = [
  { key: '通常', label: '通常', style: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' },
  { key: '急ぎ', label: '急ぎ', style: 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' },
  { key: '超急ぎ', label: '超急ぎ', style: 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' },
] as const

/** どの業務にも属さない任意タスクの置き場。常に選べる。 */
const ALWAYS_SELECTABLE = ['納品', 'その他']

type Props = {
  caseId: string
  value: NewTaskValue
  onChange: (patch: Partial<NewTaskValue>) => void
  /** 開いたときに初期値として入れたい業務（実務タブ等から開いたとき） */
  defaultGyomu?: string
  compact?: boolean
  /** 作業内容を必須にするか（タスク追加は必須／完了モーダルの候補追加は任意） */
  workRequired?: boolean
}

export default function NewTaskFields({ caseId, value, onChange, defaultGyomu, compact = false, workRequired = false }: Props) {
  const [gyomuOptions, setGyomuOptions] = useState<string[]>([])

  // 案件の受注区分・役割分担から「業務」の選択肢を用意する
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await createClient()
        .from('cases').select('service_parts, intake_roles').eq('id', caseId).single()
      if (!active || !data) return
      const roles = (data.intake_roles ?? []) as Array<{ gyomu?: string | null }>
      // 実施業務の「その他（自由入力）」は業務名が自由文なので、選択肢には入れない。
      let gyomus = [...new Set(roles.map(r => r.gyomu).filter((g): g is string => !!g && GYOMU_ALL.includes(g)))]
      if (gyomus.length === 0) gyomus = gyomuForCategories(activePartKeys(partsForCase(data)))
      setGyomuOptions(gyomus)
      if (!value.gyomu) {
        const g0 = (defaultGyomu && gyomus.includes(defaultGyomu)) ? defaultGyomu : (gyomus[0] ?? 'その他')
        onChange({ gyomu: value.roleKind === 'assistant' ? g0 : 'その他' })
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, defaultGyomu])

  // 選べる業務区分＝この案件の実施業務 ＋ 常に選べる「納品」「その他」。
  // 相続登記は相続登記チームの持ち場なので、事務管理タスクの選択肢からは外す
  // （選べてしまうと、作った本人のダッシュボードから消えて迷子になる）。
  const gyomuChoices = [...gyomuOptions, ...ALWAYS_SELECTABLE.filter(g => !gyomuOptions.includes(g))]
    .filter(g => !isHiddenForAssistant(g))
  // 管理担当/受注担当タスクは、案件の実施業務にかかわらず全業務から選べる。
  const managerGyomuChoices = [...GYOMU_ALL.filter(g => g !== 'その他'), 'その他']
  const choices = value.roleKind === 'assistant' ? gyomuChoices : managerGyomuChoices

  const label = `block ${compact ? 'text-[11.5px]' : 'text-[13px]'} font-semibold text-gray-500 mb-1`
  const inp = `w-full px-3 py-2 border border-gray-300 rounded-lg ${compact ? 'text-[12.5px]' : 'text-sm'} focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none`

  return (
    <div className="space-y-3">
      {/* 担当区分 */}
      <div>
        <label className={label}>担当区分</label>
        <div className="flex flex-col gap-1.5">
          {ROLE_KINDS.map(rk => {
            const on = value.roleKind === rk.key
            return (
              <button
                key={rk.key}
                type="button"
                onClick={() => onChange({
                  roleKind: rk.key,
                  // 事務管理＝案件の業務、管理担当/受注担当＝その他（随時）を既定にする
                  gyomu: rk.key === 'assistant' ? (gyomuOptions[0] ?? 'その他') : 'その他',
                })}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${on ? 'border-2 border-brand-400 bg-brand-50' : 'border border-gray-200 hover:bg-gray-50'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-gray-800'}`}>{rk.label}</div>
                  <div className="text-[11px] text-gray-500">{rk.desc}</div>
                </div>
                {on && <Check className="w-4 h-4 text-brand-600 flex-shrink-0" strokeWidth={2.25} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* 業務区分 */}
      <div>
        <label className={label}>業務区分</label>
        <select
          value={value.gyomu}
          onChange={e => onChange({ gyomu: e.target.value })}
          className={`${inp} text-xs`}
        >
          {choices.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-gray-400">
          {value.roleKind === 'assistant'
            ? 'どの業務にも当てはまらないときは「その他」。事務管理タスク一覧の同じ名前のタブに入ります。'
            : 'お客様とのやりとりなど、案件を進める工程と関係ないものは「その他」。一覧の「その他」サブタブに入ります。'}
        </p>
      </div>

      {/* タスク名 */}
      <div>
        <label className={label}>タスク名 *</label>
        <input
          type="text"
          value={value.title}
          onChange={e => onChange({ title: e.target.value })}
          placeholder="例：相続人へ電話連絡、督促 など"
          className={inp}
        />
      </div>

      {/* 作業内容 */}
      <div>
        <label className={label}>作業内容{workRequired && ' *'}</label>
        <textarea
          value={value.work}
          onChange={e => onChange({ work: e.target.value })}
          rows={compact ? 2 : 3}
          placeholder={workRequired ? '何をするか・気をつけることを書く' : '何をするか・気をつけることを書いておく（任意）'}
          className={`${inp} resize-y`}
        />
      </div>

      {/* 期限 */}
      <div>
        <label className={label}>期限</label>
        <input
          type="date"
          value={value.dueDate}
          onChange={e => onChange({ dueDate: e.target.value })}
          className={`${inp} text-xs`}
        />
      </div>

      {/* 外出タスク（役所回り等）。一覧の絞り込みで外出分だけまとめて拾える */}
      <label className={`flex items-center gap-2 cursor-pointer ${compact ? 'text-[12.5px]' : 'text-[13px]'} text-gray-700`}>
        <input
          type="checkbox"
          checked={value.outing}
          onChange={e => onChange({ outing: e.target.checked })}
          className="w-4 h-4 accent-brand-600"
        />
        外出タスク（役所・銀行など外に出て行う作業）
      </label>

      {/* 優先度 */}
      <div>
        <label className={label}>優先度</label>
        <div className="flex gap-1.5">
          {PRIORITIES.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange({ priority: p.key })}
              className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-lg border transition-colors ${value.priority === p.key ? 'ring-2 ring-brand-400 ring-offset-1' : ''} ${p.style}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}

/** 業務名から工程を引く（保存時に一緒に入れる） */
export const koteiOfGyomu = (gyomu: string) => koteiOf(gyomu)
