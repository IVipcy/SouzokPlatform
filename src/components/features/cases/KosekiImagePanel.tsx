'use client'

// 戸籍のスキャン画像パネル。
//   ・対象者タブ … その人の戸籍をアップロード＋一覧（targetPerson を指定）
//   ・TOP        … 全員分をまとめて一覧（targetPerson を渡さない・アップロードは出さない）
//
// アップロード直後に「書き込む／あとで」を聞く。書き込みは元画像を変えず、
// 座標・色・文字だけを koseki_images.annotations に保存する（migration 229）。
// サムネイルは画像＋書き込みを canvas で重ねて描くので、拡大表示と同じ絵になる。

import { useState, useRef } from 'react'
import { Upload, Pencil, Trash2, Download, FolderInput } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import ImageAnnotator from './ImageAnnotator'
import AnnotatedImage from './AnnotatedImage'
import { drawAnnotations, type Anno } from '@/lib/imageAnnotations'
import { useKosekiImages, KOSEKI_BUCKET as BUCKET, type KosekiImageRow } from '@/lib/useKosekiImages'
import { REQUEST_KIND_BADGE } from '@/lib/constants'
import type { KosekiRequestRow } from '@/types'

export type { KosekiImageRow }

export default function KosekiImagePanel({ caseId, targetPerson, requests = [], compact = false, title }: {
  caseId: string
  /** 指定するとその人の画像だけ。未指定なら案件の全画像（TOP用・アップロードは出さない） */
  targetPerson?: string
  /** その人の戸籍請求（役所ごと）。渡すと請求ごとに仕切って並べる */
  requests?: KosekiRequestRow[]
  /** TOPの右列など狭い場所向け。サムネイルを小さく並べる */
  compact?: boolean
  title?: string
}) {
  const supabase = createClient()
  const { rows, urls, reload: load, setRows } = useKosekiImages(caseId, targetPerson)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<KosekiImageRow | null>(null)
  const [askEdit, setAskEdit] = useState<KosekiImageRow[] | null>(null)
  const [preview, setPreview] = useState<KosekiImageRow | null>(null)
  // アップロード先の請求。null=請求 未指定。上部の「画像を追加」から入れるときは
  // 請求が複数ある人だけ、どの請求かを先に聞く。
  const [askRequest, setAskRequest] = useState<FileList | null>(null)
  const [moving, setMoving] = useState<KosekiImageRow | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 各請求の「＋ 追加」から入れたときの行き先。押した直後に file input を開くため ref で持つ。
  const pendingReqRef = useRef<string | null>(null)

  // 画像を請求ごとに仕分ける。請求が無ければ仕切らない（今までどおりの1列）。
  const groups = requests.map(rq => ({ req: rq, items: rows.filter(r => r.koseki_request_id === rq.id) }))
  const unassigned = rows.filter(r => !r.koseki_request_id || !requests.some(rq => rq.id === r.koseki_request_id))
  const grouped = requests.length > 0 && targetPerson !== undefined

  const reqLabel = (rq: KosekiRequestRow) => (rq.request_to ?? '').trim() || '請求先未設定'

  const startUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return
    // 請求の「＋ 追加」から開いたときは、その請求へ入れる
    const pending = pendingReqRef.current
    pendingReqRef.current = null
    if (pending) { upload(files, pending); return }
    // 請求が1件だけなら聞かずにそこへ入れる
    if (grouped && requests.length === 1) { upload(files, requests[0].id); return }
    if (grouped) { setAskRequest(files); return }
    upload(files, null)
  }

  const moveTo = async (row: KosekiImageRow, requestId: string | null) => {
    const { error } = await supabase.from('koseki_images').update({ koseki_request_id: requestId }).eq('id', row.id)
    if (error) { showToast(`移動に失敗: ${error.message}`, 'error'); return }
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, koseki_request_id: requestId } : r)))
    setMoving(null)
  }

  const upload = async (files: FileList | null, requestId: string | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    const created: KosekiImageRow[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { showToast(`${file.name} は画像ではありません`, 'error'); continue }
      const path = `${caseId}/${crypto.randomUUID()}_${file.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { showToast(`アップロードに失敗: ${upErr.message}`, 'error'); continue }
      const { data, error } = await supabase.from('koseki_images').insert({
        case_id: caseId, target_person: targetPerson ?? null,
        koseki_request_id: requestId,
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
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => startUpload(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-brand-300 rounded px-2 py-1 disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" />{busy ? 'アップロード中…' : '画像を追加'}
            </button>
          </>
        )}
      </div>

      {rows.length === 0 && !grouped ? (
        <p className="text-[11.5px] text-gray-400 py-3 text-center">
          {targetPerson !== undefined ? '「画像を追加」から戸籍のスキャンを登録できます' : '戸籍の画像がまだありません'}
        </p>
      ) : grouped ? (
        // 請求（役所）ごとに仕切る。どの請求で届いた戸籍かを読めるようにするため。
        <div className="space-y-2.5">
          {groups.map(({ req, items }) => (
            <div key={req.id} className="border border-gray-200 rounded-md">
              <div className="flex items-center gap-2 flex-wrap px-2.5 py-1.5 bg-gray-50 border-b border-gray-100">
                <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border ${REQUEST_KIND_BADGE[req.request_kind ?? '通常請求'] ?? REQUEST_KIND_BADGE['通常請求']}`}>
                  {req.request_kind ?? '通常請求'}
                </span>
                <span className="text-[12px] font-semibold text-gray-700">{reqLabel(req)}</span>
                <span className="text-[11px] text-gray-400">
                  {req.request_date ? `請求 ${req.request_date.slice(5).replace('-', '/')}` : '請求日なし'}
                  {req.arrival_date ? ` ・ 到着 ${req.arrival_date.slice(5).replace('-', '/')}` : ''}
                </span>
                <span className="ml-auto text-[11px] text-gray-400">{items.length}枚</span>
              </div>
              <div className="p-2">
                {items.length > 0 && (
                  <div className={`grid ${gridCls} gap-1.5 mb-1.5`}>
                    {items.map(r => (
                      <Thumb key={r.id} row={r} url={urls[r.id]} className={thumbCls}
                        onOpen={() => setPreview(r)} onEdit={() => setEditing(r)} onDelete={() => del(r)} onDownload={() => download(r)}
                        onMove={() => setMoving(r)}
                        showPerson={targetPerson === undefined} compact={compact} />
                    ))}
                  </div>
                )}
                <button type="button" disabled={busy} onClick={() => { pendingReqRef.current = req.id; fileRef.current?.click() }}
                  className="w-full py-2 text-[11.5px] text-gray-400 border border-dashed border-gray-200 rounded hover:text-brand-700 hover:border-brand-300 disabled:opacity-50">
                  ＋ この請求で届いた画像を追加
                </button>
              </div>
            </div>
          ))}
          {/* 請求 未指定。中身があるときだけ出す（空の箱を常時出しても邪魔なだけ） */}
          {unassigned.length > 0 && (
            <div className="border border-dashed border-amber-300 rounded-md">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50/60 border-b border-amber-100">
                <span className="text-[12px] font-semibold text-amber-800">請求 未指定</span>
                <span className="text-[11px] text-amber-700">どの請求で届いたぶんか決まっていない画像です</span>
                <span className="ml-auto text-[11px] text-amber-700">{unassigned.length}枚</span>
              </div>
              <div className="p-2">
                <div className={`grid ${gridCls} gap-1.5`}>
                  {unassigned.map(r => (
                    <Thumb key={r.id} row={r} url={urls[r.id]} className={thumbCls}
                      onOpen={() => setPreview(r)} onEdit={() => setEditing(r)} onDelete={() => del(r)} onDownload={() => download(r)}
                      onMove={() => setMoving(r)}
                      showPerson={targetPerson === undefined} compact={compact} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
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

      {/* どの請求で届いたぶんかを選ぶ（アップロード時） */}
      <Modal isOpen={!!askRequest} onClose={() => setAskRequest(null)} title="どの請求で届いた戸籍ですか" maxWidth="max-w-sm"
        footer={<Button variant="secondary" onClick={() => setAskRequest(null)}>キャンセル</Button>}>
        <div className="space-y-1.5">
          {requests.map(rq => (
            <button key={rq.id} type="button"
              onClick={() => { const f = askRequest; setAskRequest(null); upload(f, rq.id) }}
              className="w-full text-left px-3 py-2 rounded-md border border-gray-200 hover:border-brand-300 hover:bg-brand-50/40">
              <span className="text-[13px] font-semibold text-gray-800">{reqLabel(rq)}</span>
              <span className="block text-[11px] text-gray-500">
                {rq.request_kind ?? '通常請求'}
                {rq.request_date ? ` ・ 請求 ${rq.request_date}` : ''}
                {rq.arrival_date ? ` ・ 到着 ${rq.arrival_date}` : ''}
              </span>
            </button>
          ))}
          <button type="button" onClick={() => { const f = askRequest; setAskRequest(null); upload(f, null) }}
            className="w-full text-left px-3 py-2 rounded-md border border-dashed border-gray-300 text-[12.5px] text-gray-500 hover:text-brand-700">
            あとで決める（請求 未指定に入れる）
          </button>
        </div>
      </Modal>

      {/* 画像を別の請求へ移す */}
      <Modal isOpen={!!moving} onClose={() => setMoving(null)} title="どの請求のぶんに移しますか" maxWidth="max-w-sm"
        footer={<Button variant="secondary" onClick={() => setMoving(null)}>キャンセル</Button>}>
        <div className="space-y-1.5">
          {requests.map(rq => (
            <button key={rq.id} type="button" onClick={() => moving && moveTo(moving, rq.id)}
              className={`w-full text-left px-3 py-2 rounded-md border hover:border-brand-300 hover:bg-brand-50/40 ${moving?.koseki_request_id === rq.id ? 'border-brand-400 bg-brand-50' : 'border-gray-200'}`}>
              <span className="text-[13px] font-semibold text-gray-800">{reqLabel(rq)}</span>
              <span className="block text-[11px] text-gray-500">{rq.request_kind ?? '通常請求'}{rq.arrival_date ? ` ・ 到着 ${rq.arrival_date}` : ''}</span>
            </button>
          ))}
          <button type="button" onClick={() => moving && moveTo(moving, null)}
            className="w-full text-left px-3 py-2 rounded-md border border-dashed border-gray-300 text-[12.5px] text-gray-500 hover:text-brand-700">
            請求 未指定に戻す
          </button>
        </div>
      </Modal>

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

function Thumb({ row, url, className, onOpen, onEdit, onDelete, onDownload, onMove, showPerson, compact }: {
  row: KosekiImageRow; url?: string; className?: string
  onOpen: () => void; onEdit: () => void; onDelete: () => void; onDownload: () => void
  /** 別の請求へ移す（請求ごとに仕切っているときだけ） */
  onMove?: () => void
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
          {onMove && <button type="button" onClick={onMove} className="p-1 text-gray-500 hover:text-brand-700" title="別の請求のぶんに移す"><FolderInput className="w-3.5 h-3.5" /></button>}
          <button type="button" onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  )
}
