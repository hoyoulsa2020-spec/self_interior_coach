-- 자재창고: 이미지별 자재명 (크롤링 시 이미지마다 다른 이름 저장)
ALTER TABLE supply_materials ADD COLUMN IF NOT EXISTS image_names text[] DEFAULT '{}';

-- 뷰에 image_names 포함
DROP VIEW IF EXISTS supply_materials_ordered;
CREATE VIEW supply_materials_ordered
WITH (security_invoker = true) AS
SELECT sm.id, sm.category_id, sm.name, sm.description, sm.brand, sm.image_urls, sm.image_names, sm.thumbnail_index, sm.sort_order, sm.created_at, sm.updated_at,
       c.sort_order AS category_sort_order
FROM supply_materials sm
JOIN category c ON c.id = sm.category_id;

GRANT SELECT ON supply_materials_ordered TO authenticated;
