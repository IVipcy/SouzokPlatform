'use client'

// 戸籍のスキャン画像パネル。
//   ・対象者タブ … その人の戸籍をアップロード＋一覧（targetPerson を指定）
//   ・TOP        … 全員分をまとめて一覧（targetPerson を渡さない・アップロードは出さない）
//
// アップロード直後に「書き込む／あとで」を聞く。書き込みは元画像を変えず、
// 座標・色・文字だけを koseki_images.annotations に保存する（migration 229）。
// サムネイルは画像＋書き込みを canvas で重ねて描くので、拡大表示と同じ絵になる。

import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, Pencil, Trash2, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import ImageAnnotator from './ImageAnnotator'
import { drawAnnotations, type Anno } from '@/lib/imageAnnotations'

export type KosekiImageRow = {
  id: string
  case_id: string
  target_person: string | null
  image_path: string
  image_bucket: string
  file_name: string | null
  annotations: Anno[] | null
  sort_order: number
}

const BUCKET = 'koseki-images'

export default function KosekiImagePanel({ caseId, targetPerson, compact = false, title }: {
  caseId: string
  /** 指定するとその人の画像だけ。未指定なら案件の全画像（TOP用・アップロードは出さない） */
  targetPerson?: string
  /** TOPの右列など狭い場所向け。サムネイルを小さく並べる */
  compact?: boolean
  title?: string
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<KosekiImageRow[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<KosekiImageRow | null>(null)
  const [askEdit, setAskEdit] = useState<KosekiImageRow[] | null>(null)
  const [preview, setPreview] = useState<KosekiImageRow | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    let q = supabase.from('koseki_images').select('*').eq('case_id', caseId).order('sort_order')
    if (targetPerson !== undefined) q = q.eq('target_person', targetPerson)
    const { data } = await q
    const list = (data ?? []) as unknown as KosekiImageRow[]
    setRows(list)
    // 非公開バケットなので都度 署名付きURLを作る
    const next: Record<string, string> = {}
    await Promise.all(list.map(async r => {
      const { data: s } = await supabase.storage.from(r.image_bucket || BUCKET).createSignedUrl(r.image_path, 3600)
      if (s?.signedUrl) next[r.id] = s.signedUrl
    }))
    setUrls(next)
  }, [caseId, targetPerson, supabase])

  useEffect(() => {
    let alive = true
    ;(async () => { await load(); if (!alive) return })()
    return () => { alive = false }
  }, [load])

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    const created: KosekiImageRow[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { showToast(`${file.name} は画像ではありません`, 'error'); continue }
      const path = `${caseId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { showToast(`アップロードに失敗: ${upErr.message}`, 'error'); continue }
      const { data, error } = await supabase.from('koseki_images').insert({
        case_id: caseId, target_person: targetPerson ?? null,
        image_path: path, image_bucket: BUCKET, file_name: file.name,
        sort_order: rows.length + created.length,
      }).select('*').single()
      if (error || !data) { showToast(`登録に失敗: ${error?.message ?? ''}`, 'error'); continue }
      created.push(data as unknown as KosekiImageRow)
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    await load()
    if (created.length > 0) setAskEdit(created)
  }

  const saveAnnotations = async (row: KosekiImageRow, annos: Anno[]) => {
    const { error } = await supabase.from('koseki_images')
      .update({ annotations: annos, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, annotations: annos } : r)))
    showToast('書き込みを保存しました', 'success')
  }

  const del = async (row: KosekiImageRow) => {
    if (!confirm(`${row.file_name || 'この画像'} を削除しますか？`)) return
    await supabase.storage.from(row.image_bucket || BUCKET).remove([row.image_path])
    const { error } = await supabase.from('koseki_images').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  // 書き込みを焼き込んだ画像をダウンロード（原本はそのまま残す）
  const download = async (row: KosekiImageRow) => {
    const url = urls[row.id]
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = img.naturalWidth; cv.height = img.naturalHeight
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      drawAnnotations(ctx, row.annotations ?? [], cv.width, cv.height)
      cv.toBlob(blob => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${row.file_name?.replace(/\.[^.]+$/, '') || '戸籍'}_書込み.png`
        a.click()
        URL.revokeObjectURL(a.href)
      }, 'image/png')
    }
    img.src = url
  }

  const thumbCls = compact ? 'aspect-[3/4]' : 'aspect-[3/4]'
  const gridCls = compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5'

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-semibold text-brand-800">{title ?? '戸籍の画像'}</span>
        <span className="text-[11px] text-gray-400">{rows.length}枚</span>
        {targetPerson !== undefined && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-brand-300 rounded px-2 py-1 disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" />{busy ? 'アップロード中…' : '画像を追加'}
            </button>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-[11.5px] text-gray-400 py-3 text-center">
          {targetPerson !== undefined ? '「画像を追加」から戸籍のスキャンを登録できます' : '戸籍の画像がまだありません'}
        </p>
      ) : (
        <div className={`grid ${gridCls} gap-1.5`}>
          {rows.map(r => (
            <Thumb key={r.id} row={r} url={urls[r.id]} className={thumbCls}
              onOpen={() => setPreview(r)} onEdit={() => setEditing(r)} onDelete={() => del(r)} onDownload={() => download(r)}
              showPerson={targetPerson === undefined} compact={compact} />
          ))}
        </div>
      )}
      {!compact && <p className="mt-1.5 text-[11px] text-gray-400">元の画像には書き込みません。書いた内容は別に保存され、いつでも消せます。</p>}

      {/* アップロード直後の確認 */}
      <Modal isOpen={!!askEdit} onClose={() => setAskEdit(null)} title={`${askEdit?.length ?? 0}枚をアップロードしました`} maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskEdit(null)}>あとで</Button>
            <Button variant="primary" onClick={() => { const first = askEdit?.[0] ?? null; setAskEdit(null); if (first) setEditing(first) }}>書き込む</Button>
          </>
        }>
        <p className="text-[13px] text-gray-700 leading-relaxed">
          続けて書き込み（マーカー・メモ）をしますか。あとから画像を開いて書くこともできます。
        </p>
      </Modal>

      {/* 拡大表示 */}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title={preview?.file_name ?? '戸籍の画像'} maxWidth="max-w-5xl"
        footer={<><Button variant="secondary" onClick={() => setPreview(null)}>閉じる</Button>
          <Button variant="primary" onClick={() => { const p = preview; setPreview(null); if (p) setEditing(p) }}>書き込む</Button></>}>
        {preview && <AnnotatedImage url={urls[preview.id]} annos={preview.annotations ?? []} />}
      </Modal>

      {editing && (
        <ImageAnnotator
          isOpen
          onClose={() => setEditing(null)}
          imageUrl={urls[editing.id] ?? ''}
          initial={editing.annotations ?? []}
          title={`${editing.target_person ? `${editing.target_person}の戸籍 — ` : ''}${editing.file_name ?? '画像'}`}
          onSave={annos => saveAnnotations(editing, annos)}
        />
      )}
    </div>
  )
}

/** 画像＋書き込みを1枚の canvas に描く（サムネイル・拡大表示で共通） */
function AnnotatedImage({ url, annos, className }: { url?: string; annos: Anno[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const cv = ref.current
      if (!alive || !cv) return
      const parentW = cv.parentElement?.clientWidth ?? 400
      const w = parentW
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w)
      const dpr = window.devicePixelRatio || 1
      cv.width = w * dpr; cv.height = h * dpr
      cv.style.width = `${w}px`; cv.style.height = `${h}px`
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.drawImage(img, 0, 0, w, h)
      drawAnnotations(ctx, annos, w, h)
    }
    img.src = url
    return () => { alive = false }
  }, [url, annos])
  return <canvas ref={ref} className={`block max-w-full ${className ?? ''}`} />
}

function Thumb({ row, url, className, onOpen, onEdit, onDelete, onDownload, showPerson, compact }: {
  row: KosekiImageRow; url?: string; className?: string
  onOpen: () => void; onEdit: () => void; onDelete: () => void; onDownload: () => void
  showPerson: boolean; compact: boolean
}) {
  const hasAnno = (row.annotations ?? []).length > 0
  return (
    <div className={`relative group rounded-md border border-gray-200 bg-gray-50 overflow-hidden ${className}`}>
      <button type="button" onClick={onOpen} className="block w-full h-full">
        {url
          ? <AnnotatedImage url={url} annos={row.annotations ?? []} className="w-full object-cover" />
          : <span className="flex items-center justify-center h-full text-[11px] text-gray-300">読み込み中</span>}
      </button>
      {hasAnno && <span className="absolute right-1 top-1 w-2 h-2 rounded-sm bg-amber-500" title="書き込みあり" />}
      {showPerson && row.target_person && (
        <span className="absolute left-1 bottom-1 text-[10px] bg-white/90 rounded px-1 text-gray-600 max-w-[90%] truncate">{row.target_person}</span>
      )}
      {!compact && (
        <div className="absolute inset-x-0 bottom-0 hidden group-hover:flex justify-center gap-1 bg-white/90 py-1">
          <button type="button" onClick={onEdit} className="p-1 text-gray-500 hover:text-brand-700" title="書き込む"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={onDownload} className="p-1 text-gray-500 hover:text-brand-700" title="書き込み込みでダウンロード"><Download className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  )
}
