-- 修正 0050.TW 單位：28000（誤當股數）→ 28（張，1 張=1000 股）
-- 套用： wrangler d1 execute asset-management-db --remote --file=./fix-0050-units.sql
UPDATE investments SET units = 28 WHERE ticker = '0050.TW';
