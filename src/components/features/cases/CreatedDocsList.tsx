'use client'

import { useState } from 'react'
import { ExternalLink, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { DocumentRow } from '@/types'

type Props = {
  /** この案件で作成した書類（documents テーブル）。 */
  documents: DocumentRow[]
  onRefresh?: () => void
}

/**
 * 作成書類一覧（書類作成タブの子タブ）。
 * 各タスク等で作成した書類（documents）を案件単位でまとめて表示し、プレビュー/DL・削除できる。
 * ファイルは Storage バケット 'documents' に保管（file_path）。
 */
export default function CreatedDocsList({ documents, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null)

  const openFile = async (d: DocumentRow) => {
    if (!d.file_path) { showToast('ファイルがありません', 'error'); return }
    setBusy(d.id)
    const { data, error } = await createClient().storage.from('documents').createSignedUrl(d.file_path, 3600)
    setBusy(null)
    if (error || !data?.signedUrl) { showToast('ファイルを開けませんでした', 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const del = async (d: DocumentRow) => {
    if (!confirm('この作成書類を削除しますか？（ファイルも削除されます）')) return
    const supabase = createClient()
    if (d.file_path) await supabase.storage.from('documents').remove([d.file_path])
    const { error } = await supabase.from('documents').delete().eq('id', d.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    showToast('削除しました', 'success')
    onRefresh?.()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <h3 className="text-[14px] font-bold text-gray-900">作成書類一覧</h3>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{documents.length}件</span>
        <span className="ml-auto text-[11px] text-gray-400">各タスク等で作成した書類をまとめて表示します</span>
      </div>
      {documents.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-gray-400">作成した書類はまだありません。「書類作成」から作成すると、ここに表示されます。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">書類名</th>
                <th className="px-3 py-2 text-left font-bold">作成タスク</th>
                <th className="px-3 py-2 text-left font-bold w-28">作成日</th>
                <th className="px-3 py-2 text-left font-bold w-28">最終更新</th>
                <th className="px-3 py-2 text-left font-bold w-44">ファイル</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-[13px] text-gray-800">{d.name}</td>
                  <td className="px-3 py-2.5 text-[12px] text-gray-600">{d.tasks?.title || <span className="text-gray-300">案件全体（タスク未指定）</span>}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{d.created_at?.slice(0, 10) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{d.updated_at?.slice(0, 10) ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {d.file_path ? (
                      <button
                        type="button"
                        onClick={() => openFile(d)}
                        disabled={busy === d.id}
                        className="inline-flex items-center gap-1 max-w-[180px] px-2 py-1 text-[12px] text-brand-700 bg-brand-50 border border-brand-200 rounded hover:bg-brand-100 disabled:opacity-50"
                        title="プレビュー / ダウンロード"
                      >
                        {busy === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3 flex-shrink-0" />}
                        <span className="truncate">プレビュー / DL</span>
                      </button>
                    ) : (
                      <span className="text-gray-300 text-[12px]">ファイルなし</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button type="button" onClick={() => del(d)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
