-- 자재창고: 대공정별 자재 등록 (사진 여러장, 썸네일 지정, 이름, 설명)
CREATE TABLE IF NOT EXISTS supply_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id integer NOT NULL REFERENCES category(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_urls text[] NOT NULL DEFAULT '{}',
  thumbnail_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_materials_category ON supply_materials(category_id);
CREATE INDEX IF NOT EXISTS idx_supply_materials_name ON supply_materials USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_supply_materials_created ON supply_materials(created_at DESC);

ALTER TABLE supply_materials ENABLE ROW LEVEL SECURITY;

-- 관리자만 CRUD
CREATE POLICY "admin_all_supply_materials" ON supply_materials
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- material-images 스토리지 버킷 (이미지만, 최대 5MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('material-images', 'material-images', true, 5242880, ARRAY['image/jpeg','image/png','image/gif','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin_material_images_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'material-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "material_images_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'material-images');

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_supply_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supply_materials_updated_at ON supply_materials;
CREATE TRIGGER supply_materials_updated_at
  BEFORE UPDATE ON supply_materials
  FOR EACH ROW EXECUTE FUNCTION update_supply_materials_updated_at();
