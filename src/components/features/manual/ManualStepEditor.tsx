'use client'

// マニュアルの操作ステップ編集画面。
//
// PowerPoint でやっていた「画面キャプチャに赤枠を引いて番号を振り、右に操作方法を書く」を
// そのまま画面の中でやる。番号は自動で振られ、枠を消せば右の行も一緒に消える。
// PowerPoint で一番手が止まるのが番号の振り直しなので、そこは人にやらせない。
//
// 画像1枚ごとに1行にして、その画像の枠に対応する操作方法だけを右に並べる。
// 左右をそれぞれ縦に積むと、2枚目の画像の説明が1枚目の隣に来て、どの画像の話か読めなくなる。
//
// 座標は画像の幅・高さに対する割合（0〜1）で持つ。拡大しても印刷してもズレず、
// あとで画像だけ差し替えても枠の位置が残る。

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Upload, Trash2, Save, ArrowLeft, Eye, ClipboardPaste } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import AiAssistButton from './AiAssistButton'
import {
  MANUAL_BUCKET, MANUAL_ROLES, newId, numberOf, markCount, syncItems, itemRangeOf, rolesOfShots,
  type ManualStepRow, type Shot, type MarkBox, type StepItem,
} from '@/lib/manualStep'

export default function ManualStepEditor({ step, chapters }: { step: ManualStepRow; chapters: string[] }) {
  const supabase = createClient()
  const router = useRouter()

  const [chapter, setChapter] = useState(step.chapter)
  const [title, setTitle] = useState(step.title)
  const [shots, setShots] = useState<Shot[]>(step.shots ?? [])
  const [items, setItems] = useState<StepItem[]>(step.items ?? [])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)   // 選んでいる枠のID
  const fileRef = useRef<HTMLInputElement>(null)

  // 非公開バケットなので、表示のたびに署名付きURLを作る
  const signUrls = useCallback(async (list: Shot[]) => {
    const next: Record<string, string> = {}
    await Promise.all(list.map(async s => {
      const { data } = await supabase.storage.from(MANUAL_BUCKET).createSignedUrl(s.path, 3600)
      if (data?.signedUrl) next[s.id] = data.signedUrl
    }))
    return next
  }, [supabase])
  const loadUrls = useCallback(async (list: Shot[]) => {
    const next = await signUrls(list)
    setUrls(prev => ({ ...prev, ...next }))
  }, [signUrls])

  useEffect(() => {
    let alive = true
    const list = step.shots ?? []
    void (async () => {
      const next = await signUrls(list)
      if (alive) setUrls(prev => ({ ...prev, ...next }))
    })()
    return () => { alive = false }
  }, [signUrls, step.shots])

  const touch = () => setDirty(true)

  // ── 画像を足す（ファイル選択・貼り付けの両方から来る） ──
  const addFiles = useCallback(async (files: File[]) => {
    const added: Shot[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const path = `${step.id}/${crypto.randomUUID()}.png`
      const { error } = await supabase.storage.from(MANUAL_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (error) { showToast(`アップロードに失敗: ${error.message}`, 'error'); continue }
      added.push({ id: newId(), path, marks: [] })
    }
    if (added.length === 0) return
    setShots(prev => [...prev, ...added])
    await loadUrls(added)
    setDirty(true)
  }, [step.id, supabase, loadUrls])

  // Ctrl+V でそのまま貼れるようにする。Win+Shift+S で撮って即貼り付けできるのが狙い。
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return   // 文字の貼り付けは邪魔しない
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const toggleShotRole = (shotId: string, role: string) => {
    setShots(prev => prev.map(s => {
      if (s.id !== shotId) return s
      const cur = s.roles ?? []
      return { ...s, roles: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] }
    }))
    setDirty(true)
  }

  const removeShot = async (shotId: string) => {
    const target = shots.find(s => s.id === shotId)
    if (!target) return
    if (!confirm('この画面キャプチャを削除しますか。上に置いた赤枠と、その番号の操作方法も消えます。')) return
    // 消える枠のぶん、操作方法の行も後ろから順に落とす
    let next = items
    let cur = shots
    for (const m of [...target.marks].reverse()) {
      const idx = numberOf(cur, m.id) - 1
      cur = cur.map(s => ({ ...s, marks: s.marks.filter(x => x.id !== m.id) }))
      next = syncItems(cur, next, idx)
    }
    const rest = cur.filter(s => s.id !== shotId)
    setShots(rest)
    setItems(syncItems(rest, next))
    await supabase.storage.from(MANUAL_BUCKET).remove([target.path])
    setDirty(true)
  }

  // ── 赤枠 ──
  const addMark = (shotId: string, box: Omit<MarkBox, 'id'>) => {
    const mark: MarkBox = { id: newId(), ...box }
    const next = shots.map(s => (s.id === shotId ? { ...s, marks: [...s.marks, mark] } : s))
    setShots(next)
    setItems(syncItems(next, items))
    setSelected(mark.id)
    setDirty(true)
  }
  const removeMark = (markId: string) => {
    const idx = numberOf(shots, markId) - 1
    const next = shots.map(s => ({ ...s, marks: s.marks.filter(m => m.id !== markId) }))
    setShots(next)
    setItems(syncItems(next, items, idx))
    setSelected(null)
    setDirty(true)
  }

  const setItem = (i: number, patch: Partial<StepItem>) => {
    setItems(prev => prev.map((it, k) => (k === i ? { ...it, ...patch } : it)))
    touch()
  }

  const save = async () => {
    setSaving(true)
    // ページ全体の担当は、載っている画面の担当をまとめたもの（絞り込み・一覧表示に使う）
    const { error } = await supabase.from('manual_steps')
      .update({ chapter, title, roles: rolesOfShots(shots), shots, items })
      .eq('id', step.id)
    setSaving(false)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    showToast('保存しました', 'success')
    setDirty(false)
    router.refresh()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Manual"
        title="操作ステップの編集"
        icon={Save}
        description="画面の上をドラッグすると赤枠が引かれ、その画面の右に操作方法の行が増えます。"
        right={
          <div className="flex items-center gap-2">
            <Link href={`/manual/steps?chapter=${encodeURIComponent(chapter)}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <ArrowLeft className="w-3.5 h-3.5" />一覧へ
            </Link>
            <Link href={`/manual/steps/${step.id}/view`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Eye className="w-3.5 h-3.5" />表示を見る
            </Link>
            <Button variant="primary" size="sm" onClick={save} disabled={saving || !dirty}
              leftIcon={<Save className="w-3.5 h-3.5" />}>{saving ? '保存中…' : dirty ? '保存' : '保存済み'}</Button>
          </div>
        }
      />

      {/* ページの見出し（章・タイトル・ロール） */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 mb-3.5">
        <input value={title} onChange={e => { setTitle(e.target.value); touch() }}
          placeholder="例: STEP①：面談内容の登録"
          className="w-full px-2.5 py-1.5 text-[15px] font-semibold border border-gray-300 rounded-md outline-none focus:border-brand-400" />
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-[11px] text-gray-400">誰向けの手順かは、画面ごとに選びます</span>
          {/* 章は入ってきたタブで決まっているので、ふだんは触らない。別の章へ移したいときだけ使う。 */}
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400">章</span>
            <select value={chapter} onChange={e => { setChapter(e.target.value); touch() }}
              title="別の章へ移すときだけ変えてください"
              className="px-2 py-1 text-[11.5px] text-gray-600 border border-gray-200 rounded-md bg-white outline-none focus:border-brand-400">
              {[...new Set([chapter, ...chapters])].filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </span>
        </div>
      </div>

      {/* 列見出し */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4 mb-2">
        <div className="flex items-center gap-2 pb-1.5 border-b-2 border-gray-800">
          <span className="text-[13px] font-bold text-gray-900">画面イメージ</span>
          <span className="text-[11px] text-gray-400">画像の上をドラッグすると赤枠を引けます</span>
        </div>
        <div className="flex items-center gap-2 pb-1.5 border-b-2 border-gray-800">
          <span className="text-[13px] font-bold text-gray-900">操作方法</span>
          <span className="ml-auto text-[11px] text-gray-400">{markCount(shots)}件</span>
        </div>
      </div>

      {/* 画像1枚ごとに1行。右にはその画像の枠に対応する操作方法だけを出す。 */}
      <div className="space-y-5">
        {shots.map((s, si) => {
          const { start, count } = itemRangeOf(shots, si)
          const mine = items.slice(start, start + count)
          return (
            <div key={s.id} className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4 items-start">
              <ShotEditor
                shot={s} url={urls[s.id]} index={si} shots={shots}
                selected={selected} onSelect={setSelected}
                onAddMark={box => addMark(s.id, box)}
                onRemoveMark={removeMark}
                onRemoveShot={() => removeShot(s.id)}
                onToggleRole={r => toggleShotRole(s.id, r)}
              />
              <div className="space-y-3">
                {mine.length === 0 ? (
                  <p className="text-[12px] text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
                    左の画面をドラッグして赤枠を引くと、ここに操作方法が増えます
                  </p>
                ) : mine.map((it, k) => {
                  const gi = start + k
                  return (
                    <div key={it.id} className={`flex gap-2.5 ${selected && numberOf(shots, selected) === gi + 1 ? 'ring-2 ring-red-300 rounded-lg p-1 -m-1' : ''}`}>
                      <span className="flex-none w-6 h-6 rounded-full bg-red-600 text-white text-[13px] font-bold flex items-center justify-center mt-0.5">{gi + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-end mb-1">
                          <AiAssistButton text={it.body} context={`ページ：${title} / 章：${chapter}`} onAdopt={v => setItem(gi, { body: v })} />
                        </div>
                        <textarea
                          value={it.body}
                          onChange={e => setItem(gi, { body: e.target.value })}
                          rows={3}
                          placeholder="例: ログインしたら、TOPのメニューの面談登録を押して、面談登録画面を開きます。"
                          className="w-full px-3 py-2 text-[12.5px] leading-relaxed bg-gray-100 border border-transparent rounded outline-none focus:border-brand-400 focus:bg-white resize-y"
                        />
                        {it.rule == null ? (
                          <button type="button" onClick={() => setItem(gi, { rule: '' })}
                            className="mt-1 text-[11px] text-amber-700 hover:text-amber-800">＋ 業務ルールを付ける</button>
                        ) : (
                          <div className="mt-1 border-l-[3px] border-amber-400 bg-amber-50/70 rounded-r">
                            <div className="flex items-center gap-2 px-2.5 pt-1.5">
                              <span className="text-[10.5px] font-bold text-amber-800 tracking-wide">業務ルール</span>
                              <button type="button" onClick={() => setItem(gi, { rule: null })}
                                className="ml-auto text-[10.5px] text-gray-400 hover:text-red-500">外す</button>
                            </div>
                            <textarea
                              value={it.rule ?? ''}
                              onChange={e => setItem(gi, { rule: e.target.value })}
                              rows={2}
                              placeholder="この手順で守ってほしい決まりごと"
                              className="w-full px-2.5 pb-2 pt-1 text-[12px] leading-relaxed bg-transparent outline-none resize-y text-amber-900 placeholder:text-amber-400/70"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { addFiles(Array.from(e.target.files ?? [])); if (fileRef.current) fileRef.current.value = '' }} />
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full py-6 rounded-lg border border-dashed border-gray-300 text-[12.5px] text-gray-500 hover:text-brand-700 hover:border-brand-300">
            <span className="inline-flex items-center gap-1.5"><Upload className="w-4 h-4" />画面キャプチャを追加</span>
            <span className="block mt-1 text-[11px] text-gray-400">
              <ClipboardPaste className="w-3 h-3 inline mr-1" />
              Win+Shift+S で撮って、そのまま Ctrl+V でも貼れます
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

// 1枚の画面キャプチャ。ドラッグで枠を引き、枠をクリックで選ぶ。
function ShotEditor({ shot, url, index, shots, selected, onSelect, onAddMark, onRemoveMark, onRemoveShot, onToggleRole }: {
  shot: Shot
  url?: string
  index: number
  shots: Shot[]
  selected: string | null
  onSelect: (id: string | null) => void
  onAddMark: (box: Omit<MarkBox, 'id'>) => void
  onRemoveMark: (id: string) => void
  onRemoveShot: () => void
  onToggleRole: (role: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [draw, setDraw] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const ratio = (e: React.PointerEvent) => {
    const el = wrapRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.mark) return   // 枠の上から始めたときは選択だけ
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = ratio(e)
    setDraw({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    onSelect(null)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!draw) return
    const p = ratio(e)
    setDraw({ ...draw, x1: p.x, y1: p.y })
  }
  const onUp = () => {
    if (!draw) return
    const x = Math.min(draw.x0, draw.x1), y = Math.min(draw.y0, draw.y1)
    const w = Math.abs(draw.x1 - draw.x0), h = Math.abs(draw.y1 - draw.y0)
    setDraw(null)
    if (w < 0.01 || h < 0.005) return   // 誤クリックは枠にしない
    onAddMark({ x, y, w, h })
  }

  const live = draw
    ? { x: Math.min(draw.x0, draw.x1), y: Math.min(draw.y0, draw.y1), w: Math.abs(draw.x1 - draw.x0), h: Math.abs(draw.y1 - draw.y0) }
    : null

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-2.5 py-1.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-gray-600">画面 {index + 1}</span>
          <span className="text-[11px] text-gray-400">赤枠 {shot.marks.length}個</span>
          <button type="button" onClick={onRemoveShot} className="ml-auto p-1 text-gray-300 hover:text-red-500" title="この画面を削除">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* 誰向けの手順か。同じ章に受注担当と管理担当の手順が混ざるので、画面ごとに持つ。 */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          {MANUAL_ROLES.map(r => {
            const on = (shot.roles ?? []).includes(r)
            return (
              <button key={r} type="button" onClick={() => onToggleRole(r)}
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors ${
                  on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-400 border-gray-200 hover:border-brand-300'}`}>
                {r}
              </button>
            )
          })}
          {(shot.roles ?? []).length === 0 && <span className="text-[10.5px] text-gray-400">選ばなければ全員に出ます</span>}
        </div>
      </div>
      <div
        ref={wrapRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative select-none touch-none cursor-crosshair bg-gray-50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className="block w-full" draggable={false} />
          : <div className="h-40 flex items-center justify-center text-[12px] text-gray-300">読み込み中…</div>}

        {shot.marks.map(m => {
          const num = numberOf(shots, m.id)
          const on = selected === m.id
          return (
            <span key={m.id} data-mark="1"
              onPointerDown={e => { e.stopPropagation(); onSelect(m.id) }}
              className={`absolute border-2 rounded-[3px] cursor-pointer ${on ? 'border-red-600 bg-red-500/10' : 'border-red-600'}`}
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
            >
              <span data-mark="1"
                className="absolute -left-2.5 -top-2.5 w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
                {num}
              </span>
              {on && (
                <button type="button" data-mark="1"
                  onPointerDown={e => { e.stopPropagation(); onRemoveMark(m.id) }}
                  className="absolute -right-2.5 -top-2.5 w-[18px] h-[18px] rounded-full bg-white border border-red-300 text-red-600 text-[11px] font-bold flex items-center justify-center hover:bg-red-50"
                  title="この枠を消す（右の操作方法も消えます）">×</button>
              )}
            </span>
          )
        })}

        {live && (
          <span className="absolute border-2 border-red-400 border-dashed rounded-[3px] pointer-events-none"
            style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%`, width: `${live.w * 100}%`, height: `${live.h * 100}%` }} />
        )}
      </div>
    </div>
  )
}
