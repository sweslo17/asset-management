-- 為既有 D1 加上 batches.type（投入/轉換）
-- 套用： wrangler d1 execute asset-management-db --remote --file=./migrate-add-batch-type.sql
ALTER TABLE batches ADD COLUMN type TEXT NOT NULL DEFAULT 'contribution';
-- 既有批次預設為 contribution（投入）。之後新增的轉換批次會標 rebalance。
