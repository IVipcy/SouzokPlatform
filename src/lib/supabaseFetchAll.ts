// Supabase(PostgREST) は1回の select で最大1000行しか返さない（サーバー設定の既定）。
// 請求・入金・売上表のように件数が増え続ける表は、黙って切れると「報酬が0円に見える案件」が出る。
// .range() でページを送って全件そろえる共通ヘルパー。
//
// 使い方：
//   const rows = await fetchAllRows<Row>((from, to) =>
//     supabase.from('invoices').select('...').order('created_at').range(from, to))
// 並び順（order）は必ず付けること。順序が不定だとページの境目で行が重複・欠落する。

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: out, error }
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: out, error: null }
}
