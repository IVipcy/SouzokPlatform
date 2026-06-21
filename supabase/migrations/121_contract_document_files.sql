-- 契約時受領の書類(contract_documents)にスキャンPDF等のファイルを添付できるようにする。
-- 原本にそのまま書き込む等でスキャンしないケースもあるため任意(NULL可)。実体はStorage('documents')。
ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS file_bucket text;
ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS file_type text;

COMMENT ON COLUMN contract_documents.file_path IS '受領書類のスキャンファイル等のStorageパス。NULL=未添付(原本のみ等)。';
COMMENT ON COLUMN contract_documents.file_bucket IS '受領書類ファイルのStorageバケット(通常 documents)。';
