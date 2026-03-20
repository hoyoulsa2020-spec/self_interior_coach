-- 공지사항 이미지 첨부
ALTER TABLE notices ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- notice-images 스토리지 버킷
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('notice-images', 'notice-images', true, 5242880, ARRAY['image/jpeg','image/png','image/gif','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 인증된 사용자 업로드 (관리자만 - RLS에서 제한)
DROP POLICY IF EXISTS "notice_images_insert" ON storage.objects;
CREATE POLICY "notice_images_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'notice-images');

DROP POLICY IF EXISTS "notice_images_select" ON storage.objects;
CREATE POLICY "notice_images_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'notice-images');
