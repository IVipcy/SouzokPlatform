'use client'

// 操作ステップの表示。PowerPoint で作っていたページと同じ体裁（左＝画面イメージ／右＝操作方法）。
// 印刷にもそのまま使えるよう、色と枠線は薄い紙面向けにしている。

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Printer, Pencil, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MANUAL_BUCKET, numberOf, type ManualStepRow } from '@/lib/manualStep'

export default function ManualStepView({ step }: { step: ManualStepRow }) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    ;(async () => {
      const next: Record<string, string> = {}
      await Promise.all((step.shots ?? []).map(async s => {
        const { data } = await supabase.storage.from(MANUAL_BUCKET).createSignedUrl(s.path, 3600)
        if (data?.signedUrl) next[s.id] = data.signedUrl
      }))
      if (alive) setUrls(next)
    })()
    return () => { alive = false }
  }, [step.shots])

  return (
    <div>
      {/* 画面用の操作列。印刷には出さない */}
      <div className="flex items-center gap-2 mb-3 print:hidden">
        <Link href="/manual/steps" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          <ArrowLeft className="w-3.5 h-3.5" />一覧へ
        </Link>
        <Link href={`/manual/steps/${step.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Pencil className="w-3.5 h-3.5" />編集
        </Link>
        <button type="button" onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Printer className="w-3.5 h-3.5" />印刷
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 print:border-0">
        {/* 見出し＋ロール */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h1 className="text-[19px] font-bold text-gray-900">{step.title || '（無題）'}</h1>
          {(step.roles ?? []).map(r => (
            <span key={r} className="text-[12px] font-semibold text-white bg-brand-600 rounded-full px-3.5 py-0.5">{r}</span>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-7">
          {/* 左：画面イメージ */}
          <div>
            <div className="text-[13px] font-bold text-center pb-1.5 border-b-2 border-[#1B3B6F] w-[76%] mx-auto mb-3.5">画面イメージ</div>
            <div className="space-y-4">
              {(step.shots ?? []).map(s => (
                <div key={s.id} className="relative border border-gray-200 rounded overflow-hidden">
                  {urls[s.id]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={urls[s.id]} alt="" className="block w-full" />
                    : <div className="h-40 bg-gray-50" />}
                  {s.marks.map(m => (
                    <span key={m.id} className="absolute border-2 border-red-600 rounded-[3px]"
                      style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}>
                      <span className="absolute -left-2.5 -top-2.5 w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
                        {numberOf(step.shots, m.id)}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
              {(step.shots ?? []).length === 0 && (
                <p className="text-[12px] text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded">画面キャプチャがありません</p>
              )}
            </div>
          </div>

          {/* 右：操作方法 */}
          <div>
            <div className="text-[13px] font-bold text-center pb-1.5 border-b-2 border-[#1B3B6F] w-[76%] mx-auto mb-3.5">操作方法</div>
            <div className="space-y-4">
              {(step.items ?? []).map((it, i) => (
                <div key={it.id} className="flex gap-2.5">
                  <span className="flex-none w-[19px] h-[19px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-100 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-gray-800 whitespace-pre-wrap">
                      <span className="text-brand-700 font-bold mr-1.5">✓</span>{it.body}
                    </div>
                    {it.rule && (
                      <div className="mt-1.5 border-l-[3px] border-amber-400 bg-amber-50 px-3 py-2 rounded-r">
                        <div className="text-[10.5px] font-bold text-amber-800 tracking-wide mb-0.5">業務ルール</div>
                        <div className="text-[12px] leading-relaxed text-amber-900 whitespace-pre-wrap">{it.rule}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(step.items ?? []).length === 0 && (
                <p className="text-[12px] text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded">操作方法がありません</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5 pt-2.5 border-t border-gray-100 text-[11px] text-gray-400">
          <span>{step.chapter} › {step.title || '（無題）'}</span>
          <span className="ml-auto">最終更新 {(step.updated_at ?? '').slice(0, 10)}</span>
        </div>
      </div>
    </div>
  )
}
