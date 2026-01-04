use rusqlite::Result;
use crate::db::Database;

/// Initialize database schema
pub fn init_schema(db: &Database) -> Result<()> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    // Create API Keys table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            rate_limit INTEGER
        )",
        [],
    )?;

    // Create usage records table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS usage_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            request_time TEXT NOT NULL,
            request_id TEXT,
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
        )",
        [],
    )?;

    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_api_key_id ON usage_records(api_key_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_request_time ON usage_records(request_time)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_composite ON usage_records(api_key_id, model, request_time)",
        [],
    )?;

    // 迁移：添加 deleted_at 字段（软删除支持）
    // 检查 api_keys 表是否已有 deleted_at 字段
    let has_deleted_at: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(api_keys)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        columns.contains(&"deleted_at".to_string())
    };

    if !has_deleted_at {
        conn.execute(
            "ALTER TABLE api_keys ADD COLUMN deleted_at TEXT",
            [],
        )?;
    }

    // 确保 admin key 记录存在（id=0）
    // 这是为了让管理员 key 的用量记录能够正确关联
    let admin_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM api_keys WHERE id = 0",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if !admin_exists {
        conn.execute(
            "INSERT INTO api_keys (id, key_hash, key_prefix, name, enabled, created_at)
             VALUES (0, 'admin', 'admin', 'admin', 1, datetime('now'))",
            [],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_schema() {
        let db = Database::new_in_memory().unwrap();
        let result = init_schema(&db);
        assert!(result.is_ok());

        let conn = db.conn();
        let conn = conn.lock().unwrap();

        // Verify api_keys table structure
        let mut stmt = conn.prepare("PRAGMA table_info(api_keys)").unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(columns.contains(&"id".to_string()));
        assert!(columns.contains(&"key_hash".to_string()));
        assert!(columns.contains(&"key_prefix".to_string()));
        assert!(columns.contains(&"name".to_string()));
        assert!(columns.contains(&"enabled".to_string()));
        assert!(columns.contains(&"created_at".to_string()));
        assert!(columns.contains(&"expires_at".to_string()));
        assert!(columns.contains(&"rate_limit".to_string()));
        assert!(columns.contains(&"deleted_at".to_string()));

        // Verify usage_records table structure
        let mut stmt = conn.prepare("PRAGMA table_info(usage_records)").unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(columns.contains(&"id".to_string()));
        assert!(columns.contains(&"api_key_id".to_string()));
        assert!(columns.contains(&"model".to_string()));
        assert!(columns.contains(&"input_tokens".to_string()));
        assert!(columns.contains(&"output_tokens".to_string()));
        assert!(columns.contains(&"request_time".to_string()));
        assert!(columns.contains(&"request_id".to_string()));

        // Verify indexes exist
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='index'").unwrap();
        let indexes: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(indexes.contains(&"idx_usage_api_key_id".to_string()));
        assert!(indexes.contains(&"idx_usage_model".to_string()));
        assert!(indexes.contains(&"idx_usage_request_time".to_string()));
        assert!(indexes.contains(&"idx_usage_composite".to_string()));
    }

    #[test]
    fn test_schema_idempotent() {
        let db = Database::new_in_memory().unwrap();

        // Initialize schema multiple times
        assert!(init_schema(&db).is_ok());
        assert!(init_schema(&db).is_ok());
        assert!(init_schema(&db).is_ok());
    }
}
