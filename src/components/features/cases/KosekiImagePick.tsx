'use client'

// タスクに付ける「参照する戸籍画像」。
//
// 戸籍を読んで次の請求先が分かった人が、次のタスク（例：戸籍請求：大田区（近藤花子））に
// 「この画像を見て」と画像を付けておく。持つのは画像のID（tasks.ext_data.ref_image_ids）だけで、
// ファイルは複製しない。あとから赤枠やマーカーを足しても、タスク側にそのまま映る。
//
//   KosekiImagePicker … チェックで選ぶ（完了モーダル・タスク詳細の「＋画像を足す」）
//   TaskRefImages     … タスク詳細に出す一覧（押すと拡大。足す・外すもここ）

import { useState, useEffect } from 'react'
import { Plus, X, Images } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import AnnotatedImage from './AnnotatedImage'
import KosekiImageViewer, { type ViewerImage } from './KosekiImageViewer'
import { useKosekiImages, type KosekiImageRow } from '@/lib/useKosekiImages'
import { taskRefImageIds } from '@/lib/taskLanding'
import { kosekiRequestLabel } from '@/lib/constants'
import type { TaskRow } from '@/types'

type ReqLite = { id: string; request_to: string | null; doc_types: string | null; doc_form: string | null; target_person: string | null }

/** 画像の見出し「近藤智也 ／ 横浜市　戸籍」。どの請求で届いたかを名前に含める */
function captionOf(r: KosekiImageRow, reqs: ReqLite[]): string {
  const rq = r.koseki_request_id ? reqs.find(x => x.id === r.koseki_request_id) : undefined
  return [r.target_person || '対象者未設定', rq ? kosekiRequestLabel(rq) : '請求 未指定'].join(' ／ ')
}

/** 案件の戸籍請求（画像の見出し用）。呼び出し側で1回だけ読む */
export function useKosekiRequestsLite(caseId: string): ReqLite[] {
  const [reqs, setReqs] = useState<ReqLite[]>([])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await createClient().from('koseki_requests').select('id, request_to, doc_types, doc_form, target_person').eq('case_id', caseId)
      if (alive) setReqs((data ?? []) as ReqLite[])
    })()
    return () => { alive = false }
  }, [caseId])
  return reqs
}

/**
 * 画像を選ぶ。selected=null なら defaultIds（今読んだ請求の画像）が選ばれた扱い。
 * 一度でも触ったら selected に確定する。
 */
export function KosekiImagePicker({ caseId, selected, onChange, defaultRequestId, title = '次の担当に見せる画像', note }: {
  caseId: string
  selected: string[] | null
  onChange: (ids: string[]) => void
  /** 既定でチェックする画像＝この請求で届いた画像 */
  defaultRequestId?: string | null
  title?: string
  note?: string
}) {
  const { rows, urls } = useKosekiImages(caseId)
  const reqs = useKosekiRequestsLite(caseId)
  if (rows.length === 0) return null
  const defaults = defaultRequestId ? rows.filter(r => r.koseki_request_id === defaultRequestId).map(r => r.id) : []
  const cur = new Set(selected ?? defaults)
  const toggle = (id: string) => {
    const next = new Set(cur)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange([...next])
  }
  const defaultReq = defaultRequestId ? reqs.find(x => x.id === defaultRequestId) : undefined
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Images className="w-3.5 h-3.5 text-brand-600" />
        <span className="text-[12.5px] font-semibold text-gray-700">{title}</span>
        {defaultReq && <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700">今読んだ請求「{kosekiRequestLabel(defaultReq)}」の画像</span>}
        <span className="ml-auto text-[11px] text-gray-400">{cur.size}枚</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {rows.map(r => {
          const on = cur.has(r.id)
          return (
            <button key={r.id} type="button" onClick={() => toggle(r.id)} title={captionOf(r, reqs)}
              className={`relative aspect-[3/4] rounded border overflow-hidden bg-gray-50 text-left ${on ? 'border-brand-500 ring-2 ring-brand-300' : 'border-gray-200 opacity-70 hover:opacity-100'}`}>
              {urls[r.id] ? <AnnotatedImage url={urls[r.id]} annos={r.annotations ?? []} className="w-full h-full object-cover" /> : <span className="block w-full h-full" />}
              <span className={`absolute left-1 top-1 w-4 h-4 rounded-sm text-[10px] leading-4 text-center font-bold ${on ? 'bg-brand-600 text-white' : 'bg-white/90 border border-gray-300 text-transparent'}`}>✓</span>
              <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-white/90 text-[9.5px] text-gray-600 truncate">{r.target_person || '—'}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{note ?? '既定で今読んだ請求の画像にチェック。外したり、他の画像を足したりできます。作るタスク全部に同じ画像が付きます。'}</p>
    </div>
  )
}

/** タスク詳細の「参照する戸籍画像」。押すと拡大（書き込み込み）。足す・外すもここ */
export function TaskRefImages({ task, caseId, fromLabel }: {
  task: TaskRow
  caseId: string
  /** 「前の作業『○○』を完了した人が付けた画像です」の○○ */
  fromLabel?: string | null
}) {
  const [ids, setIds] = useState<string[]>(() => taskRefImageIds(task))
  const { rows, urls } = useKosekiImages(caseId)
  const reqs = useKosekiRequestsLite(caseId)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [draft, setDraft] = useState<string[] | null>(null)

  const mine = ids.map(id => rows.find(r => r.id === id)).filter((r): r is KosekiImageRow => !!r)
  const viewerImages: ViewerImage[] = mine.map(r => {
    const rq = r.koseki_request_id ? reqs.find(x => x.id === r.koseki_request_id) : undefined
    return { id: r.id, person: r.target_person ?? '', requestLabel: rq ? kosekiRequestLabel(rq) : null, url: urls[r.id], annos: r.annotations ?? [], fileName: r.file_name }
  })

  const save = async (next: string[]) => {
    const ext = { ...((task.ext_data ?? {}) as Record<string, unknown>), ref_image_ids: next }
    const { error } = await createClient().from('tasks').update({ ext_data: ext }).eq('id', task.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    setIds(next)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Images className="w-4 h-4 text-brand-600" />
        <span className="text-[13.5px] font-bold text-gray-800">参照する戸籍画像</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{mine.length}枚</span>
        <button type="button" onClick={() => { setDraft(ids); setPickOpen(true) }}
          className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 border border-brand-300 rounded px-2 py-1 hover:bg-brand-50">
          <Plus className="w-3.5 h-3.5" />画像を足す
        </button>
      </div>
      <p className="text-[12px] text-gray-500 mb-2">
        {fromLabel ? `前の作業「${fromLabel}」を完了した人が付けた画像です。` : '次の請求先を決めるときに見る画像です。'}押すと拡大（書き込み込み）で開きます。
      </p>
      {mine.length === 0 ? (
        <p className="text-[12px] text-gray-400">まだ付いていません。「画像を足す」から、この案件の戸籍画像を選べます。</p>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {mine.map(r => (
            <div key={r.id} className="relative group w-[76px]">
              <button type="button" onClick={() => setViewerId(r.id)} title={captionOf(r, reqs)}
                className="block w-[76px] h-[100px] rounded border border-gray-300 overflow-hidden bg-gray-50 hover:border-brand-500">
                {urls[r.id] ? <AnnotatedImage url={urls[r.id]} annos={r.annotations ?? []} className="w-full h-full object-cover" /> : <span className="block w-full h-full" />}
              </button>
              <span className="block mt-0.5 text-[10px] text-gray-500 truncate" title={captionOf(r, reqs)}>{captionOf(r, reqs)}</span>
              <button type="button" title="このタスクから外す（画像は消えません）" onClick={() => void save(ids.filter(x => x !== r.id))}
                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {viewerId && (
        <KosekiImageViewer images={viewerImages} startId={viewerId} onClose={() => setViewerId(null)} />
      )}

      <Modal isOpen={pickOpen} onClose={() => setPickOpen(false)} title="参照する戸籍画像を選ぶ" maxWidth="max-w-2xl"
        footer={<>
          <Button variant="secondary" onClick={() => setPickOpen(false)}>キャンセル</Button>
          <Button variant="primary" onClick={async () => { await save(draft ?? ids); setPickOpen(false) }}>この画像にする</Button>
        </>}>
        {pickOpen && (
          <KosekiImagePicker caseId={caseId} selected={draft ?? ids} onChange={setDraft} title="この案件の戸籍画像"
            note="チェックした画像がこのタスクに付きます。画像そのものは戸籍請求タブのものと同じで、複製はしません。" />
        )}
      </Modal>
    </div>
  )
}
