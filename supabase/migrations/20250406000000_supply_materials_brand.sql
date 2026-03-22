-- 자재창고: 브랜드명 컬럼 추가
ALTER TABLE supply_materials ADD COLUMN IF NOT EXISTS brand text;

-- 뷰에 brand 포함 (컬럼 추가 시 DROP 후 CREATE 필요)
DROP VIEW IF EXISTS supply_materials_ordered;
CREATE VIEW supply_materials_ordered
WITH (security_invoker = true) AS
SELECT sm.id, sm.category_id, sm.name, sm.description, sm.brand, sm.image_urls, sm.thumbnail_index, sm.sort_order, sm.created_at, sm.updated_at,
       c.sort_order AS category_sort_order
FROM supply_materials sm
JOIN category c ON c.id = sm.category_id;

GRANT SELECT ON supply_materials_ordered TO authenticated;
