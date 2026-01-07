use rusqlite::{params, Result};
use sha2::{Sha256, Digest};
use hex;
use chrono::{DateTime, Utc};
use crate::db::Database;

/// API Key information (without the full key)
#[derive(Debug, Clone)]
pub struct ApiKeyInfo {
    pub id: i64,
    pub key_prefix: String,
    pub name: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub rate_limit: Option<i64>,
}

/// API Key update parameters
#[derive(Debug, Default)]
pub struct ApiKeyUpdate {
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub expires_at: Option<Option<DateTime<Utc>>>,
    pub rate_limit: Option<Option<i64>>,
}

/// Generate a new API key with format: sk-kiro-{32 hex chars}
fn generate_api_key() -> String {
    let random_bytes: Vec<u8> = (0..16).map(|_| fastrand::u8(..)).collect();
    let hex_string = hex::encode(random_bytes);
    format!("sk-kiro-{}", hex_string)
}

/// Hash an API key using SHA256
fn hash_api_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hex::encode(hasher.finalize())
}

/// Extract the prefix from an API key (first 15 characters)
fn extract_key_prefix(key: &str) -> String {
    if key.len() >= 15 {
        key[..15].to_string()
    } else {
        key.to_string()
    }
}

/// Create a new API key
pub fn create_api_key(
    db: &Database,
    name: String,
    expires_at: Option<DateTime<Utc>>,
    rate_limit: Option<i64>,
) -> Result<(i64, String)> {
    let full_key = generate_api_key();
    let key_hash = hash_api_key(&full_key);
    let key_prefix = extract_key_prefix(&full_key);
    let created_at = Utc::now();

    let conn = db.conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "INSERT INTO api_keys (key_hash, key_prefix, name, enabled, created_at, expires_at, rate_limit)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6)",
        params![
            key_hash,
            key_prefix,
            name,
            created_at.to_rfc3339(),
            expires_at.map(|dt| dt.to_rfc3339()),
            rate_limit,
        ],
    )?;

    let id = conn.last_insert_rowid();

    Ok((id, full_key))
}

/// Verify an API key and return its information if valid
pub fn verify_api_key(db: &Database, key: &str) -> Result<Option<ApiKeyInfo>> {
    let key_hash = hash_api_key(key);

    let conn = db.conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, key_prefix, name, enabled, created_at, expires_at, rate_limit
         FROM api_keys
         WHERE key_hash = ?1 AND deleted_at IS NULL",
    )?;

    let result = stmt.query_row(params![key_hash], |row| {
        let created_at_str: String = row.get(4)?;
        let expires_at_str: Option<String> = row.get(5)?;

        Ok(ApiKeyInfo {
            id: row.get(0)?,
            key_prefix: row.get(1)?,
            name: row.get(2)?,
            enabled: row.get::<_, i64>(3)? != 0,
            created_at: DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            expires_at: expires_at_str.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            }),
            rate_limit: row.get(6)?,
        })
    });

    match result {
        Ok(info) => {
            // Check if key is enabled
            if !info.enabled {
                return Ok(None);
            }

            // Check if key has expired
            if let Some(expires_at) = info.expires_at {
                if Utc::now() > expires_at {
                    return Ok(None);
                }
            }

            Ok(Some(info))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// List all API keys (without full keys) - excludes soft-deleted keys
pub fn list_api_keys(db: &Database) -> Result<Vec<ApiKeyInfo>> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, key_prefix, name, enabled, created_at, expires_at, rate_limit
         FROM api_keys
         WHERE deleted_at IS NULL
         ORDER BY created_at DESC",
    )?;

    let keys = stmt.query_map([], |row| {
        let created_at_str: String = row.get(4)?;
        let expires_at_str: Option<String> = row.get(5)?;

        Ok(ApiKeyInfo {
            id: row.get(0)?,
            key_prefix: row.get(1)?,
            name: row.get(2)?,
            enabled: row.get::<_, i64>(3)? != 0,
            created_at: DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            expires_at: expires_at_str.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            }),
            rate_limit: row.get(6)?,
        })
    })?;

    keys.collect()
}

/// Update an API key
pub fn update_api_key(db: &Database, id: i64, updates: ApiKeyUpdate) -> Result<bool> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    let mut query_parts = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(name) = updates.name {
        query_parts.push("name = ?");
        params_vec.push(Box::new(name));
    }

    if let Some(enabled) = updates.enabled {
        query_parts.push("enabled = ?");
        params_vec.push(Box::new(if enabled { 1 } else { 0 }));
    }

    if let Some(expires_at) = updates.expires_at {
        query_parts.push("expires_at = ?");
        params_vec.push(Box::new(expires_at.map(|dt| dt.to_rfc3339())));
    }

    if let Some(rate_limit) = updates.rate_limit {
        query_parts.push("rate_limit = ?");
        params_vec.push(Box::new(rate_limit));
    }

    if query_parts.is_empty() {
        return Ok(false);
    }

    let query = format!(
        "UPDATE api_keys SET {} WHERE id = ?",
        query_parts.join(", ")
    );

    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let rows_affected = conn.execute(&query, params_refs.as_slice())?;

    Ok(rows_affected > 0)
}

/// Soft delete an API key (sets deleted_at timestamp)
pub fn delete_api_key(db: &Database, id: i64) -> Result<bool> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    let deleted_at = Utc::now().to_rfc3339();
    let rows_affected = conn.execute(
        "UPDATE api_keys SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![deleted_at, id],
    )?;

    Ok(rows_affected > 0)
}

/// Get an API key by ID
pub fn get_api_key_by_id(db: &Database, id: i64) -> Result<Option<ApiKeyInfo>> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, key_prefix, name, enabled, created_at, expires_at, rate_limit
         FROM api_keys
         WHERE id = ?1",
    )?;

    let result = stmt.query_row(params![id], |row| {
        let created_at_str: String = row.get(4)?;
        let expires_at_str: Option<String> = row.get(5)?;

        Ok(ApiKeyInfo {
            id: row.get(0)?,
            key_prefix: row.get(1)?,
            name: row.get(2)?,
            enabled: row.get::<_, i64>(3)? != 0,
            created_at: DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            expires_at: expires_at_str.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            }),
            rate_limit: row.get(6)?,
        })
    });

    match result {
        Ok(info) => Ok(Some(info)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_api_key() {
        let key = generate_api_key();
        assert!(key.starts_with("sk-kiro-"));
        assert_eq!(key.len(), 40); // "sk-kiro-" (8) + 32 hex chars
    }

    #[test]
    fn test_hash_api_key() {
        let key = "sk-kiro-0123456789abcdef0123456789abcdef";
        let hash1 = hash_api_key(key);
        let hash2 = hash_api_key(key);

        // Same key should produce same hash
        assert_eq!(hash1, hash2);

        // Hash should be 64 hex characters (SHA256)
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_extract_key_prefix() {
        let key = "sk-kiro-0123456789abcdef";
        let prefix = extract_key_prefix(key);
        assert_eq!(prefix, "sk-kiro-0123456");
    }

    #[test]
    fn test_create_api_key() {
        let db = Database::new_in_memory().unwrap();

        // Note: Database init creates an admin key with id=0
        let initial_count = list_api_keys(&db).unwrap().len();

        let (id, full_key) = create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        assert!(id > 0);
        assert!(full_key.starts_with("sk-kiro-"));

        // Verify key was stored (should have one more than initial)
        let keys = list_api_keys(&db).unwrap();
        assert_eq!(keys.len(), initial_count + 1);
        // Find our newly created key
        let our_key = keys.iter().find(|k| k.id == id).unwrap();
        assert_eq!(our_key.name, "Test Key");
    }

    #[test]
    fn test_verify_api_key() {
        let db = Database::new_in_memory().unwrap();

        let (_id, full_key) = create_api_key(&db, "Test Key".to_string(), None, Some(100)).unwrap();

        // Verify with correct key
        let info = verify_api_key(&db, &full_key).unwrap();
        assert!(info.is_some());
        let info = info.unwrap();
        assert_eq!(info.name, "Test Key");
        assert_eq!(info.rate_limit, Some(100));
        assert!(info.enabled);

        // Verify with incorrect key
        let info = verify_api_key(&db, "sk-kiro-wrongkey").unwrap();
        assert!(info.is_none());
    }

    #[test]
    fn test_verify_disabled_key() {
        let db = Database::new_in_memory().unwrap();

        let (id, full_key) = create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Disable the key
        update_api_key(&db, id, ApiKeyUpdate {
            enabled: Some(false),
            ..Default::default()
        }).unwrap();

        // Verify should return None for disabled key
        let info = verify_api_key(&db, &full_key).unwrap();
        assert!(info.is_none());
    }

    #[test]
    fn test_verify_expired_key() {
        let db = Database::new_in_memory().unwrap();

        // Create key that expired 1 hour ago
        let expires_at = Utc::now() - chrono::Duration::hours(1);
        let (_id, full_key) = create_api_key(&db, "Test Key".to_string(), Some(expires_at), None).unwrap();

        // Verify should return None for expired key
        let info = verify_api_key(&db, &full_key).unwrap();
        assert!(info.is_none());
    }

    #[test]
    fn test_list_api_keys() {
        let db = Database::new_in_memory().unwrap();

        // Note: Database init creates an admin key with id=0
        let initial_count = list_api_keys(&db).unwrap().len();

        create_api_key(&db, "Key 1".to_string(), None, None).unwrap();
        create_api_key(&db, "Key 2".to_string(), None, Some(200)).unwrap();
        create_api_key(&db, "Key 3".to_string(), None, None).unwrap();

        let keys = list_api_keys(&db).unwrap();
        assert_eq!(keys.len(), initial_count + 3);

        // Should be ordered by created_at DESC, so our new keys are first
        assert_eq!(keys[0].name, "Key 3");
        assert_eq!(keys[1].name, "Key 2");
        assert_eq!(keys[2].name, "Key 1");
    }

    #[test]
    fn test_update_api_key() {
        let db = Database::new_in_memory().unwrap();

        let (id, _full_key) = create_api_key(&db, "Original Name".to_string(), None, None).unwrap();

        // Update name and rate limit
        let updated = update_api_key(&db, id, ApiKeyUpdate {
            name: Some("New Name".to_string()),
            rate_limit: Some(Some(500)),
            ..Default::default()
        }).unwrap();

        assert!(updated);

        // Verify updates
        let info = get_api_key_by_id(&db, id).unwrap().unwrap();
        assert_eq!(info.name, "New Name");
        assert_eq!(info.rate_limit, Some(500));
    }

    #[test]
    fn test_update_nonexistent_key() {
        let db = Database::new_in_memory().unwrap();

        let updated = update_api_key(&db, 999, ApiKeyUpdate {
            name: Some("New Name".to_string()),
            ..Default::default()
        }).unwrap();

        assert!(!updated);
    }

    #[test]
    fn test_delete_api_key() {
        let db = Database::new_in_memory().unwrap();

        // Note: Database init creates an admin key with id=0
        let initial_count = list_api_keys(&db).unwrap().len();

        let (id, _full_key) = create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Delete the key
        let deleted = delete_api_key(&db, id).unwrap();
        assert!(deleted);

        // Verify it's gone (back to initial count)
        let keys = list_api_keys(&db).unwrap();
        assert_eq!(keys.len(), initial_count);
    }

    #[test]
    fn test_delete_nonexistent_key() {
        let db = Database::new_in_memory().unwrap();

        let deleted = delete_api_key(&db, 999).unwrap();
        assert!(!deleted);
    }

    #[test]
    fn test_get_api_key_by_id() {
        let db = Database::new_in_memory().unwrap();

        let (id, _full_key) = create_api_key(&db, "Test Key".to_string(), None, Some(100)).unwrap();

        let info = get_api_key_by_id(&db, id).unwrap();
        assert!(info.is_some());
        let info = info.unwrap();
        assert_eq!(info.id, id);
        assert_eq!(info.name, "Test Key");
        assert_eq!(info.rate_limit, Some(100));

        // Test nonexistent ID
        let info = get_api_key_by_id(&db, 999).unwrap();
        assert!(info.is_none());
    }

    #[test]
    fn test_create_key_with_expiration() {
        let db = Database::new_in_memory().unwrap();

        let expires_at = Utc::now() + chrono::Duration::days(30);
        let (id, full_key) = create_api_key(&db, "Expiring Key".to_string(), Some(expires_at), None).unwrap();

        // Verify key is valid
        let info = verify_api_key(&db, &full_key).unwrap();
        assert!(info.is_some());

        // Verify expiration date
        let info = get_api_key_by_id(&db, id).unwrap().unwrap();
        assert!(info.expires_at.is_some());
    }
}
