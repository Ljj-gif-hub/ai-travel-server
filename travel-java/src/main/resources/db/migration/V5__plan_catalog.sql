-- MySQL 手工迁移：保留公共模板库存表，但不再用于个性化规划的缓存。
-- prod 默认 ddl-auto=none；在恢复库存维护功能前执行本脚本。
-- 新规划入口仅使用 Agent 的用户级 TTL 缓存，不依赖本表存在。
CREATE TABLE IF NOT EXISTS plan_catalog (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    destination VARCHAR(50) NOT NULL,
    days INT NOT NULL,
    plan_json LONGTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_plan_catalog_dest_days (destination, days)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
