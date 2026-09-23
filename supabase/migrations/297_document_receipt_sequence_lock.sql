-- ============================================================
-- 297_document_receipt_sequence_lock.sql
-- 受信番号（document_receipts.sequence_no）の採番を同時登録に耐えるようにする。
--
--   041 の採番は BEFORE INSERT で「同じ到着日の MAX+1」を取るだけだった。
--   2人が同時に登録すると両方が同じ MAX を読み、同じ番号で INSERT して
--   UNIQUE (received_date, sequence_no) に当たり、片方が失敗していた。
--
--   到着日ごとのトランザクション用アドバイザリロックを取ってから MAX+1 を読む。
--   ロックは INSERT を含むトランザクションの終わりまで持つので、後から来た方は
--   前の INSERT が確定してから MAX を読み、必ず次の番号になる。
--   番号の付け方（MMDD/連番・日ごとに 001 から）は変えない。
-- ============================================================

CREATE OR REPLACE FUNCTION assign_document_receipt_sequence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sequence_no IS NULL OR NEW.sequence_no = 0 THEN
    -- 到着日ごとに直列化（キーは日付の文字列から作る。別の日どうしは待たない）
    PERFORM pg_advisory_xact_lock(hashtext('document_receipts:' || NEW.received_date::text));
    SELECT COALESCE(MAX(sequence_no), 0) + 1
      INTO NEW.sequence_no
      FROM document_receipts
      WHERE received_date = NEW.received_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーは 041 のまま（BEFORE INSERT）。関数を差し替えるだけで効く。
-- 確認: select prosrc from pg_proc where proname = 'assign_document_receipt_sequence';
