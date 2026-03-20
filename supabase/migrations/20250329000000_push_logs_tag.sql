-- 푸시 발송 이력에 tag 컬럼 추가 (푸시 종류 상세 구분)
ALTER TABLE push_logs ADD COLUMN IF NOT EXISTS tag text;
