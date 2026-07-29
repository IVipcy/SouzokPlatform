-- 難易度の「難しい理由」（複数選択）＋その他自由記述。
-- 難易度は普通/難/激難の3段階（cases.difficulty）。その内訳理由をここに保持する。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS difficulty_reasons text[];       -- 依頼者がクセあり/工数が多い/未成年あり/個別対応多い
ALTER TABLE cases ADD COLUMN IF NOT EXISTS difficulty_reason_other text;    -- その他難しい理由（自由記述）
