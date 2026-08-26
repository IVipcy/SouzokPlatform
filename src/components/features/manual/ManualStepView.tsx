'use client'

// 操作ステップの表示。PowerPoint で作っていたページと同じ体裁（左＝画面イメージ／右＝操作方法）。
//
// 画像1枚ごとに1行にして、その画像の枠に対応する操作方法だけを右に並べる。
// 左右をそれぞれ縦に積むと、2枚目の画像の説明が1枚目の隣に来てしまい、
// どの画像の話なのか読めなくなるため。
//
// 印刷にもそのまま使えるよう、色と枠線は薄い紙面向けにしている。

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Printer, Pencil, ArrowLeft, BookOpen, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MANUAL_BUCKET, numberOf, itemRangeOf, rolesOfShots, type ManualStepRow } from '@/lib/manualStep'

export default function ManualStepView({ step, embedded = false }: {
  step: ManualStepRow
  /** 章の通し読みの中に埋め込むとき。一覧へ戻る／印刷は出さず、見出しを小さくする */
  embedded?: boolean
}) {
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

  const shots = step.shots ?? []
  const items = step.items ?? []

  return (
    <div>
      {!embedded && (
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
      )}

      <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 print:border-0 print:break-inside-avoid">
        {/* 見出し＋ロール */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h2 className="text-[19px] font-bold text-brand-900">{step.title || '（無題）'}</h2>
          {rolesOfShots(shots).map(r => (
            <span key={r} className="text-[12px] font-semibold text-white bg-brand-600 rounded-full px-3.5 py-0.5">{r}</span>
          ))}
          {embedded && (
            <Link href={`/manual/steps/${step.id}`} title="このステップを編集"
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-semibold text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 print:hidden">
              <Pencil className="w-3.5 h-3.5" />編集
            </Link>
          )}
        </div>

        {/* 列見出し */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-7 mb-3.5">
          <div className="text-[13px] font-bold text-center pb-1.5 border-b-2 border-[#1B3B6F] w-[76%] mx-auto">画面イメージ</div>
          <div className="text-[13px] font-bold text-center pb-1.5 border-b-2 border-[#1B3B6F] w-[76%] mx-auto">操作方法</div>
        </div>

        {shots.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded">画面キャプチャがありません</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {shots.map((s, si) => {
              const { start, count } = itemRangeOf(shots, si)
              const mine = items.slice(start, start + count)
              return (
                <div key={s.id} className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-7 items-start py-6 first:pt-0 print:break-inside-avoid">
                  {/* 左：この画面。担当はページ全体ではなく画面ごとに出す（章の中で担当が混ざるため） */}
                  <div>
                    {(s.roles ?? []).length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        {(s.roles ?? []).map(r => (
                          <span key={r} className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2.5 py-0.5">{r}</span>
                        ))}
                      </div>
                    )}
                  {/* 縦長のスマホ画像は高さで止めて中央に置く。囲みは画像にぴったり合わせる（赤枠がずれない） */}
                  <div className="relative border border-gray-200 rounded overflow-hidden w-fit mx-auto max-w-full">
                    {urls[s.id]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={urls[s.id]} alt="" className="block max-w-full max-h-[560px] w-auto" />
                      : <div className="h-40 w-64 bg-gray-50" />}
                    {s.marks.map(m => (
                      <span key={m.id} className="absolute border-2 border-red-600 rounded-[3px]"
                        style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}>
                        <span className="absolute -left-2.5 -top-2.5 w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
                          {numberOf(shots, m.id)}
                        </span>
                      </span>
                    ))}
                  </div>
                  </div>

                  {/* 右：この画面に対応する操作方法だけ */}
                  <div className="space-y-4">
                    {mine.length === 0 ? (
                      <p className="text-[11.5px] text-gray-400">この画面には赤枠がありません</p>
                    ) : mine.map((it, k) => (
                      <div key={it.id} className="flex gap-2.5">
                        <span className="flex-none w-[19px] h-[19px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{start + k + 1}</span>
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
                          {/* 関連ページ。考え方の詳しい説明は業務運用ルールに置き、ここからは飛ばすだけ。 */}
                          {(it.links ?? []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5 print:hidden">
                              {(it.links ?? []).map((l, li) => l.kind === 'article' ? (
                                <Link key={li} href={`/manual/rules/${l.id}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 text-[11px] text-brand-700 hover:bg-brand-50">
                                  <BookOpen className="w-3 h-3" strokeWidth={2} />{l.label}
                                </Link>
                              ) : (
                                <a key={li} href={l.url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 text-[11px] text-brand-700 hover:bg-brand-50">
                                  <ExternalLink className="w-3 h-3" strokeWidth={2} />{l.label}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-3 mt-5 pt-2.5 border-t border-gray-100 text-[11px] text-gray-400">
          <span>{step.chapter} › {step.title || '（無題）'}</span>
          <span className="ml-auto">最終更新 {(step.updated_at ?? '').slice(0, 10)}</span>
        </div>
      </div>
    </div>
  )
}
