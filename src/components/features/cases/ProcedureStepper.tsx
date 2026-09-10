'use client'

// 工程図（丸と線）。預金の手続きタブと同じ見た目を共通部品にしたもの。
//   済＝緑の✓、今＝青の点（薄い輪）、これから＝灰色、戻り（修正あり等）＝赤。
//   番号は付けない（見出しの Step①〜 と食い違うため）。段の下に根拠を1行。
//   並行して動くもの（全店調査・修正あり）は下の「並行」の行に出す。

export type StepperNode = { label: string; sub?: string; state: 'done' | 'now' | 'future' | 'warn' }

export default function ProcedureStepper({ nodes, parallel, parallelTone = 'amber' }: {
  nodes: StepperNode[]
  /** 並行の行の文言。null／undefined なら出さない */
  parallel?: string | null
  parallelTone?: 'amber' | 'emerald' | 'red'
}) {
  const toneCls = parallelTone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : parallelTone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
  return (
    <div className="px-2 pt-1 pb-2">
      <div className="flex">
        {nodes.map((n, idx) => {
          const st = n.state
          const lineDone = st === 'done'
          return (
            <div key={`${n.label}-${idx}`} className="flex-1 text-center relative">
              {idx < nodes.length - 1 && <div className={`absolute top-[11px] left-1/2 right-[-50%] h-[2px] ${lineDone ? 'bg-emerald-600' : 'bg-gray-200'}`} />}
              <div className={`relative z-10 w-[20px] h-[20px] mx-auto rounded-full text-[11px] font-bold flex items-center justify-center ${
                st === 'done' ? 'bg-emerald-600 text-white'
                : st === 'now' ? 'bg-brand-600 ring-4 ring-brand-100'
                : st === 'warn' ? 'bg-red-600 text-white ring-4 ring-red-100'
                : 'bg-gray-200'}`}>{st === 'done' ? '✓' : st === 'warn' ? '!' : ''}</div>
              <div className={`mt-1.5 text-[12.5px] ${st === 'now' ? 'text-brand-800 font-bold' : st === 'warn' ? 'text-red-700 font-bold' : st === 'done' ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{n.label}</div>
              {n.sub !== undefined && <div className={`text-[11.5px] ${st === 'now' ? 'text-brand-700' : st === 'warn' ? 'text-red-600' : 'text-gray-400'}`}>{n.sub}</div>}
            </div>
          )
        })}
      </div>
      {parallel && (
        <div className="mt-2 ml-2 flex items-center gap-2 text-[12px] text-gray-500">
          <span className="w-10 border-t-2 border-dashed border-gray-300" />
          <span>並行</span>
          <span className={`px-2 py-[1px] text-[11.5px] font-semibold ${toneCls}`}>{parallel}</span>
        </div>
      )}
    </div>
  )
}
