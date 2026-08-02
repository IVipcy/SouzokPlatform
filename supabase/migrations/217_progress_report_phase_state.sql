-- 案件報告(progress_reports)に「フェーズ」「状態」を追加。
--   phase        : 戸籍/財産調査/目録作成/協議中/協議書作成/登記/解約（案件報告=progress_check のときに使用）
--   report_state : 問題なし順調に進行中/確認事項あり/困りごとありHELP/至急！！
--                  状態='至急！！' かつ 未確認(status='依頼中') の案件報告は 要注意バナー(赤)に載せる。

ALTER TABLE progress_reports ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE progress_reports ADD COLUMN IF NOT EXISTS report_state text;

COMMENT ON COLUMN progress_reports.phase IS '案件報告のフェーズ（戸籍/財産調査/目録作成/協議中/協議書作成/登記/解約）';
COMMENT ON COLUMN progress_reports.report_state IS '案件報告の状態（問題なし順調に進行中/確認事項あり/困りごとありHELP/至急！！）';
