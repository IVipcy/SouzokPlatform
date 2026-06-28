import { createClient } from '@/lib/supabase/client'

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/**
 * 複数ファイルを案件フォルダ（documents バケット `案件ID/folder/`）へアップロードし case_files に登録する。
 * 案件フォルダ方式の共通処理。CaseFolderSection と 到着物受信簿 から使う。
 */
export async function uploadFilesToCaseFolder(
  caseId: string,
  files: File[],
  memberId: string | null,
): Promise<{ ok: number; failed: number }> {
  const supabase = createClient()
  let ok = 0
  let failed = 0
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const ext = extOf(f.name) || 'bin'
    const safe = f.name.replace(/[^\w.\-]+/g, '_')
    const path = `${caseId}/folder/${Date.now()}-${i}-${safe}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: true })
    if (upErr) { failed++; continue }
    const { error: dbErr } = await supabase.from('case_files').insert({
      case_id: caseId,
      file_path: path,
      file_bucket: 'documents',
      file_name: f.name,
      file_type: f.type || ext.toUpperCase() || null,
      file_size: f.size,
      uploaded_by: memberId,
    })
    if (dbErr) { failed++; continue }
    ok++
  }
  return { ok, failed }
}
