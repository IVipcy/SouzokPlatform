-- ============================================================
-- 235_koseki_image_request.sql
-- 戸籍の画像を「どの請求で届いたぶんか」に紐づける。
--
-- 画像は人（target_person）に紐づけていたが、転籍を追うと同じ人に役所ごとの請求が
-- 何件も並ぶため、届いた画像がどの請求のものか読めなくなっていた。
-- 請求への紐づけを足し、画面では請求（役所）ごとに仕切って並べる。
--
-- 人への紐づけ（target_person）はそのまま残す。請求の行を消しても画像は消えず、
-- 「請求 未指定」に戻るだけにするため（ON DELETE SET NULL）。
-- ============================================================

ALTER TABLE koseki_images
  ADD COLUMN IF NOT EXISTS koseki_request_id UUID REFERENCES koseki_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_koseki_images_request ON koseki_images(koseki_request_id);

-- 既存データの振り分け：その人の戸籍請求が1件しかなければ、その請求のぶんとみなす。
-- 複数ある人は判断できないので「請求 未指定」に残し、画面から仕分けてもらう。
UPDATE koseki_images img
SET koseki_request_id = only_req.id
FROM (
  SELECT case_id, trim(coalesce(target_person, '')) AS person, min(id) AS id, count(*) AS n
  FROM koseki_requests
  GROUP BY case_id, trim(coalesce(target_person, ''))
) only_req
WHERE img.koseki_request_id IS NULL
  AND img.case_id = only_req.case_id
  AND trim(coalesce(img.target_person, '')) = only_req.person
  AND only_req.n = 1;
