pub mod schema;
pub mod api_keys;
pub mod usage;

use rusqlite::{Connection, Result};
use std::sync::{Arc, Mutex};
use std::path::Path;

/// Database connection wrapper with thread-safe access
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Create a new database connection
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };

        // Initialize schema
        schema::init_schema(&db)?;

        Ok(db)
    }

    /// Create an in-memory database (for testing)
    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };

        // Initialize schema
        schema::init_schema(&db)?;

        Ok(db)
    }

    /// Get a reference to the connection
    pub fn conn(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_creation() {
        let db = Database::new_in_memory().unwrap();
        let conn = db.conn();
        let conn = conn.lock().unwrap();

        // Verify tables exist
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(tables.contains(&"api_keys".to_string()));
        assert!(tables.contains(&"usage_records".to_string()));
    }
}
