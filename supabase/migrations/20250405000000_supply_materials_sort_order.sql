-- 자재창고 정렬 순서 (드래그앤드롭용)
ALTER TABLE supply_materials ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_supply_materials_sort ON supply_materials(category_id, sort_order ASC, created_at DESC);

-- 대공정 sort_order 기준 정렬용 뷰 (category.sort_order → material.sort_order → created_at)
-- security_invoker: RLS가 현재 사용자 기준으로 적용되도록
CREATE OR REPLACE VIEW supply_materials_ordered
WITH (security_invoker = true) AS
SELECT sm.id, sm.category_id, sm.name, sm.description, sm.image_urls, sm.thumbnail_index, sm.sort_order, sm.created_at, sm.updated_at,
       c.sort_order AS category_sort_order
FROM supply_materials sm
JOIN category c ON c.id = sm.category_id;

GRANT SELECT ON supply_materials_ordered TO authenticated;
