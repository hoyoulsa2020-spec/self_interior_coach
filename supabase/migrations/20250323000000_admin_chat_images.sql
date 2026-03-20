-- 채팅 이미지 첨부: image_urls 컬럼 추가
ALTER TABLE admin_chat_messages ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- chat-images 스토리지 버킷 (이미지만, 최대 2MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', true, 2097152, ARRAY['image/jpeg','image/png','image/gif','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 인증된 사용자 업로드/조회 허용
DROP POLICY IF EXISTS "admin_chat_images_upload" ON storage.objects;
CREATE POLICY "admin_chat_images_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "admin_chat_images_select" ON storage.objects;
CREATE POLICY "admin_chat_images_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-images');
