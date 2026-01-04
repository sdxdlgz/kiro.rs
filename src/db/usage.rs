use rusqlite::{params, Result};
use chrono::{DateTime, Utc};
use crate::db::Database;

/// Usage record
#[derive(Debug, Clone)]
pub struct UsageRecord {
    pub id: i64,
    pub api_key_id: i64,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub request_time: DateTime<Utc>,
    pub request_id: Option<String>,
}

/// Usage query filters
#[derive(Debug, Default)]
pub struct UsageFilters {
    pub api_key_id: Option<i64>,
    pub model: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Usage summary for aggregation
#[derive(Debug, Clone)]
pub struct UsageSummary {
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_tokens: i64,
    pub groups: Vec<UsageGroup>,
}

/// Usage group for aggregation
#[derive(Debug, Clone)]
pub struct UsageGroup {
    pub key: String,
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

/// Usage group with model info for cost calculation
#[derive(Debug, Clone)]
pub struct UsageGroupWithModel {
    pub key: String,
    pub model: String,
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

/// Group by options for aggregation
#[derive(Debug, Clone, Copy)]
pub enum GroupBy {
    None,
    Model,
    Day,
    Hour,
}

/// Record usage for an API request
pub fn record_usage(
    db: &Database,
    api_key_id: i64,
    model: String,
    input_tokens: i64,
    output_tokens: i64,
    request_id: Option<String>,
) -> Result<i64> {
    let request_time = Utc::now();

    let conn = db.conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "INSERT INTO usage_records (api_key_id, model, input_tokens, output_tokens, request_time, request_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            api_key_id,
            model,
            input_tokens,
            output_tokens,
            request_time.to_rfc3339(),
            request_id,
        ],
    )?;

    Ok(conn.last_insert_rowid())
}

/// Query usage records with filters
pub fn query_usage(db: &Database, filters: UsageFilters) -> Result<Vec<UsageRecord>> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    let mut query = String::from(
        "SELECT id, api_key_id, model, input_tokens, output_tokens, request_time, request_id
         FROM usage_records
         WHERE 1=1"
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(api_key_id) = filters.api_key_id {
        query.push_str(" AND api_key_id = ?");
        params_vec.push(Box::new(api_key_id));
    }

    if let Some(model) = filters.model {
        query.push_str(" AND model = ?");
        params_vec.push(Box::new(model));
    }

    if let Some(start_time) = filters.start_time {
        query.push_str(" AND request_time >= ?");
        params_vec.push(Box::new(start_time.to_rfc3339()));
    }

    if let Some(end_time) = filters.end_time {
        query.push_str(" AND request_time <= ?");
        params_vec.push(Box::new(end_time.to_rfc3339()));
    }

    query.push_str(" ORDER BY request_time DESC");

    if let Some(limit) = filters.limit {
        query.push_str(" LIMIT ?");
        params_vec.push(Box::new(limit));
    }

    if let Some(offset) = filters.offset {
        query.push_str(" OFFSET ?");
        params_vec.push(Box::new(offset));
    }

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&query)?;
    let records = stmt.query_map(params_refs.as_slice(), |row| {
        let request_time_str: String = row.get(5)?;

        Ok(UsageRecord {
            id: row.get(0)?,
            api_key_id: row.get(1)?,
            model: row.get(2)?,
            input_tokens: row.get(3)?,
            output_tokens: row.get(4)?,
            request_time: DateTime::parse_from_rfc3339(&request_time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            request_id: row.get(6)?,
        })
    })?;

    records.collect()
}

/// Aggregate usage statistics
pub fn aggregate_usage(
    db: &Database,
    api_key_id: Option<i64>,
    model: Option<String>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    group_by: GroupBy,
) -> Result<UsageSummary> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    // Build the base query
    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(api_key_id) = api_key_id {
        where_clauses.push("api_key_id = ?");
        params_vec.push(Box::new(api_key_id));
    }

    if let Some(model) = model.clone() {
        where_clauses.push("model = ?");
        params_vec.push(Box::new(model));
    }

    if let Some(start_time) = start_time {
        where_clauses.push("request_time >= ?");
        params_vec.push(Box::new(start_time.to_rfc3339()));
    }

    if let Some(end_time) = end_time {
        where_clauses.push("request_time <= ?");
        params_vec.push(Box::new(end_time.to_rfc3339()));
    }

    let where_clause = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    // Get total statistics
    let total_query = format!(
        "SELECT COUNT(*), SUM(input_tokens), SUM(output_tokens)
         FROM usage_records
         {}",
        where_clause
    );

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&total_query)?;
    let (total_requests, total_input_tokens, total_output_tokens) = stmt.query_row(params_refs.as_slice(), |row| {
        Ok((
            row.get::<_, i64>(0).unwrap_or(0),
            row.get::<_, i64>(1).unwrap_or(0),
            row.get::<_, i64>(2).unwrap_or(0),
        ))
    })?;

    // Get grouped statistics
    let groups = match group_by {
        GroupBy::None => Vec::new(),
        GroupBy::Model => {
            let group_query = format!(
                "SELECT model, COUNT(*), SUM(input_tokens), SUM(output_tokens)
                 FROM usage_records
                 {}
                 GROUP BY model
                 ORDER BY COUNT(*) DESC",
                where_clause
            );

            let mut stmt = conn.prepare(&group_query)?;
            let groups = stmt.query_map(params_refs.as_slice(), |row| {
                let input_tokens: i64 = row.get(2)?;
                let output_tokens: i64 = row.get(3)?;
                Ok(UsageGroup {
                    key: row.get(0)?,
                    requests: row.get(1)?,
                    input_tokens,
                    output_tokens,
                    total_tokens: input_tokens + output_tokens,
                })
            })?;

            groups.collect::<Result<Vec<_>, _>>()?
        }
        GroupBy::Day => {
            let group_query = format!(
                "SELECT DATE(request_time), COUNT(*), SUM(input_tokens), SUM(output_tokens)
                 FROM usage_records
                 {}
                 GROUP BY DATE(request_time)
                 ORDER BY DATE(request_time) DESC",
                where_clause
            );

            let mut stmt = conn.prepare(&group_query)?;
            let groups = stmt.query_map(params_refs.as_slice(), |row| {
                let input_tokens: i64 = row.get(2)?;
                let output_tokens: i64 = row.get(3)?;
                Ok(UsageGroup {
                    key: row.get(0)?,
                    requests: row.get(1)?,
                    input_tokens,
                    output_tokens,
                    total_tokens: input_tokens + output_tokens,
                })
            })?;

            groups.collect::<Result<Vec<_>, _>>()?
        }
        GroupBy::Hour => {
            let group_query = format!(
                "SELECT strftime('%Y-%m-%d %H:00:00', request_time), COUNT(*), SUM(input_tokens), SUM(output_tokens)
                 FROM usage_records
                 {}
                 GROUP BY strftime('%Y-%m-%d %H:00:00', request_time)
                 ORDER BY strftime('%Y-%m-%d %H:00:00', request_time) DESC",
                where_clause
            );

            let mut stmt = conn.prepare(&group_query)?;
            let groups = stmt.query_map(params_refs.as_slice(), |row| {
                let input_tokens: i64 = row.get(2)?;
                let output_tokens: i64 = row.get(3)?;
                Ok(UsageGroup {
                    key: row.get(0)?,
                    requests: row.get(1)?,
                    input_tokens,
                    output_tokens,
                    total_tokens: input_tokens + output_tokens,
                })
            })?;

            groups.collect::<Result<Vec<_>, _>>()?
        }
    };

    Ok(UsageSummary {
        total_requests,
        total_input_tokens,
        total_output_tokens,
        total_tokens: total_input_tokens + total_output_tokens,
        groups,
    })
}

/// Aggregate usage with model info for cost calculation (used for time-based grouping)
pub fn aggregate_usage_with_model(
    db: &Database,
    api_key_id: Option<i64>,
    model: Option<String>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    group_by: GroupBy,
) -> Result<Vec<UsageGroupWithModel>> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    // Build the base query
    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(api_key_id) = api_key_id {
        where_clauses.push("api_key_id = ?");
        params_vec.push(Box::new(api_key_id));
    }

    if let Some(model) = model.clone() {
        where_clauses.push("model = ?");
        params_vec.push(Box::new(model));
    }

    if let Some(start_time) = start_time {
        where_clauses.push("request_time >= ?");
        params_vec.push(Box::new(start_time.to_rfc3339()));
    }

    if let Some(end_time) = end_time {
        where_clauses.push("request_time <= ?");
        params_vec.push(Box::new(end_time.to_rfc3339()));
    }

    let where_clause = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let groups = match group_by {
        GroupBy::None | GroupBy::Model => {
            // For None or Model grouping, just group by model
            let group_query = format!(
                "SELECT model, model, COUNT(*), SUM(input_tokens), SUM(output_tokens)
                 FROM usage_records
                 {}
                 GROUP BY model
                 ORDER BY COUNT(*) DESC",
                where_clause
            );

            let mut stmt = conn.prepare(&group_query)?;
            let groups = stmt.query_map(params_refs.as_slice(), |row| {
                let input_tokens: i64 = row.get(3)?;
                let output_tokens: i64 = row.get(4)?;
                Ok(UsageGroupWithModel {
                    key: row.get(0)?,
                    model: row.get(1)?,
                    requests: row.get(2)?,
                    input_tokens,
                    output_tokens,
                    total_tokens: input_tokens + output_tokens,
                })
            })?;

            groups.collect::<Result<Vec<_>, _>>()?
        }
        GroupBy::Day => {
            // Group by day AND model
            let group_query = format!(
                "SELECT DATE(request_time), model, COUNT(*), SUM(input_tokens), SUM(output_tokens)
                 FROM usage_records
                 {}
                 GROUP BY DATE(request_time), model
                 ORDER BY DATE(request_time) DESC, COUNT(*) DESC",
                where_clause
            );

            let mut stmt = conn.prepare(&group_query)?;
            let groups = stmt.query_map(params_refs.as_slice(), |row| {
                let input_tokens: i64 = row.get(3)?;
                let output_tokens: i64 = row.get(4)?;
                Ok(UsageGroupWithModel {
                    key: row.get(0)?,
                    model: row.get(1)?,
                    requests: row.get(2)?,
                    input_tokens,
                    output_tokens,
                    total_tokens: input_tokens + output_tokens,
                })
            })?;

            groups.collect::<Result<Vec<_>, _>>()?
        }
        GroupBy::Hour => {
            // Group by hour AND model
            let group_query = format!(
                "SELECT strftime('%Y-%m-%d %H:00:00', request_time), model, COUNT(*), SUM(input_tokens), SUM(output_tokens)
                 FROM usage_records
                 {}
                 GROUP BY strftime('%Y-%m-%d %H:00:00', request_time), model
                 ORDER BY strftime('%Y-%m-%d %H:00:00', request_time) DESC, COUNT(*) DESC",
                where_clause
            );

            let mut stmt = conn.prepare(&group_query)?;
            let groups = stmt.query_map(params_refs.as_slice(), |row| {
                let input_tokens: i64 = row.get(3)?;
                let output_tokens: i64 = row.get(4)?;
                Ok(UsageGroupWithModel {
                    key: row.get(0)?,
                    model: row.get(1)?,
                    requests: row.get(2)?,
                    input_tokens,
                    output_tokens,
                    total_tokens: input_tokens + output_tokens,
                })
            })?;

            groups.collect::<Result<Vec<_>, _>>()?
        }
    };

    Ok(groups)
}

/// Get usage for a specific API key
pub fn get_api_key_usage(
    db: &Database,
    api_key_id: i64,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
) -> Result<UsageSummary> {
    aggregate_usage(db, Some(api_key_id), None, start_time, end_time, GroupBy::Model)
}

/// Usage record with key name for export
#[derive(Debug, Clone)]
pub struct UsageRecordWithKeyName {
    pub id: i64,
    pub api_key_id: i64,
    pub key_name: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub request_time: DateTime<Utc>,
    pub request_id: Option<String>,
}

/// Query usage records with key names for export
pub fn query_usage_for_export(db: &Database, filters: UsageFilters) -> Result<Vec<UsageRecordWithKeyName>> {
    let conn = db.conn();
    let conn = conn.lock().unwrap();

    let mut query = String::from(
        "SELECT ur.id, ur.api_key_id, COALESCE(ak.name, 'Unknown') as key_name, ur.model,
                ur.input_tokens, ur.output_tokens, ur.request_time, ur.request_id
         FROM usage_records ur
         LEFT JOIN api_keys ak ON ur.api_key_id = ak.id
         WHERE 1=1"
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(api_key_id) = filters.api_key_id {
        query.push_str(" AND ur.api_key_id = ?");
        params_vec.push(Box::new(api_key_id));
    }

    if let Some(model) = filters.model {
        query.push_str(" AND ur.model = ?");
        params_vec.push(Box::new(model));
    }

    if let Some(start_time) = filters.start_time {
        query.push_str(" AND ur.request_time >= ?");
        params_vec.push(Box::new(start_time.to_rfc3339()));
    }

    if let Some(end_time) = filters.end_time {
        query.push_str(" AND ur.request_time <= ?");
        params_vec.push(Box::new(end_time.to_rfc3339()));
    }

    query.push_str(" ORDER BY ur.request_time DESC");

    if let Some(limit) = filters.limit {
        query.push_str(" LIMIT ?");
        params_vec.push(Box::new(limit));
    }

    if let Some(offset) = filters.offset {
        query.push_str(" OFFSET ?");
        params_vec.push(Box::new(offset));
    }

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&query)?;
    let records = stmt.query_map(params_refs.as_slice(), |row| {
        let request_time_str: String = row.get(6)?;

        Ok(UsageRecordWithKeyName {
            id: row.get(0)?,
            api_key_id: row.get(1)?,
            key_name: row.get(2)?,
            model: row.get(3)?,
            input_tokens: row.get(4)?,
            output_tokens: row.get(5)?,
            request_time: DateTime::parse_from_rfc3339(&request_time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            request_id: row.get(7)?,
        })
    })?;

    records.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::api_keys;

    #[test]
    fn test_record_usage() {
        let db = Database::new_in_memory().unwrap();

        // Create an API key first
        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record usage
        let id = record_usage(
            &db,
            api_key_id,
            "claude-3-opus".to_string(),
            1000,
            500,
            Some("req-123".to_string()),
        ).unwrap();

        assert!(id > 0);

        // Query the record
        let records = query_usage(&db, UsageFilters {
            api_key_id: Some(api_key_id),
            ..Default::default()
        }).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].model, "claude-3-opus");
        assert_eq!(records[0].input_tokens, 1000);
        assert_eq!(records[0].output_tokens, 500);
        assert_eq!(records[0].request_id, Some("req-123".to_string()));
    }

    #[test]
    fn test_query_usage_with_filters() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record multiple usage records
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-sonnet".to_string(), 800, 400, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1200, 600, None).unwrap();

        // Query all records
        let records = query_usage(&db, UsageFilters::default()).unwrap();
        assert_eq!(records.len(), 3);

        // Query by model
        let records = query_usage(&db, UsageFilters {
            model: Some("claude-3-opus".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(records.len(), 2);

        // Query with limit
        let records = query_usage(&db, UsageFilters {
            limit: Some(2),
            ..Default::default()
        }).unwrap();
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn test_query_usage_with_time_filters() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        let now = Utc::now();
        let two_hours_ago = now - chrono::Duration::hours(2);

        // Record usage
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();

        // Query with time range
        let records = query_usage(&db, UsageFilters {
            start_time: Some(two_hours_ago),
            end_time: Some(now + chrono::Duration::hours(1)),
            ..Default::default()
        }).unwrap();
        assert_eq!(records.len(), 1);

        // Query with start time in the future (should return 0)
        let records = query_usage(&db, UsageFilters {
            start_time: Some(now + chrono::Duration::hours(1)),
            ..Default::default()
        }).unwrap();
        assert_eq!(records.len(), 0);
    }

    #[test]
    fn test_aggregate_usage_no_grouping() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record multiple usage records
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-sonnet".to_string(), 800, 400, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1200, 600, None).unwrap();

        let summary = aggregate_usage(&db, Some(api_key_id), None, None, None, GroupBy::None).unwrap();

        assert_eq!(summary.total_requests, 3);
        assert_eq!(summary.total_input_tokens, 3000);
        assert_eq!(summary.total_output_tokens, 1500);
        assert_eq!(summary.total_tokens, 4500);
        assert_eq!(summary.groups.len(), 0);
    }

    #[test]
    fn test_aggregate_usage_by_model() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record multiple usage records
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-sonnet".to_string(), 800, 400, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1200, 600, None).unwrap();

        let summary = aggregate_usage(&db, Some(api_key_id), None, None, None, GroupBy::Model).unwrap();

        assert_eq!(summary.total_requests, 3);
        assert_eq!(summary.groups.len(), 2);

        // Find opus group
        let opus_group = summary.groups.iter().find(|g| g.key == "claude-3-opus").unwrap();
        assert_eq!(opus_group.requests, 2);
        assert_eq!(opus_group.input_tokens, 2200);
        assert_eq!(opus_group.output_tokens, 1100);
        assert_eq!(opus_group.total_tokens, 3300);

        // Find sonnet group
        let sonnet_group = summary.groups.iter().find(|g| g.key == "claude-3-sonnet").unwrap();
        assert_eq!(sonnet_group.requests, 1);
        assert_eq!(sonnet_group.input_tokens, 800);
        assert_eq!(sonnet_group.output_tokens, 400);
        assert_eq!(sonnet_group.total_tokens, 1200);
    }

    #[test]
    fn test_aggregate_usage_with_model_filter() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record multiple usage records
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-sonnet".to_string(), 800, 400, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1200, 600, None).unwrap();

        let summary = aggregate_usage(
            &db,
            Some(api_key_id),
            Some("claude-3-opus".to_string()),
            None,
            None,
            GroupBy::None,
        ).unwrap();

        assert_eq!(summary.total_requests, 2);
        assert_eq!(summary.total_input_tokens, 2200);
        assert_eq!(summary.total_output_tokens, 1100);
    }

    #[test]
    fn test_get_api_key_usage() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record usage
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-sonnet".to_string(), 800, 400, None).unwrap();

        let summary = get_api_key_usage(&db, api_key_id, None, None).unwrap();

        assert_eq!(summary.total_requests, 2);
        assert_eq!(summary.total_input_tokens, 1800);
        assert_eq!(summary.total_output_tokens, 900);
        assert_eq!(summary.groups.len(), 2);
    }

    #[test]
    fn test_aggregate_usage_by_day() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record usage
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-sonnet".to_string(), 800, 400, None).unwrap();

        let summary = aggregate_usage(&db, Some(api_key_id), None, None, None, GroupBy::Day).unwrap();

        assert_eq!(summary.total_requests, 2);
        // Should have at least 1 day group
        assert!(summary.groups.len() >= 1);
    }

    #[test]
    fn test_aggregate_usage_by_hour() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record usage
        record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        record_usage(&db, api_key_id, "claude-3-sonnet".to_string(), 800, 400, None).unwrap();

        let summary = aggregate_usage(&db, Some(api_key_id), None, None, None, GroupBy::Hour).unwrap();

        assert_eq!(summary.total_requests, 2);
        // Should have at least 1 hour group
        assert!(summary.groups.len() >= 1);
    }

    #[test]
    fn test_query_usage_pagination() {
        let db = Database::new_in_memory().unwrap();

        let (api_key_id, _) = api_keys::create_api_key(&db, "Test Key".to_string(), None, None).unwrap();

        // Record 10 usage records
        for _ in 0..10 {
            record_usage(&db, api_key_id, "claude-3-opus".to_string(), 1000, 500, None).unwrap();
        }

        // Get first page
        let records = query_usage(&db, UsageFilters {
            limit: Some(5),
            offset: Some(0),
            ..Default::default()
        }).unwrap();
        assert_eq!(records.len(), 5);

        // Get second page
        let records = query_usage(&db, UsageFilters {
            limit: Some(5),
            offset: Some(5),
            ..Default::default()
        }).unwrap();
        assert_eq!(records.len(), 5);

        // Get third page (should be empty)
        let records = query_usage(&db, UsageFilters {
            limit: Some(5),
            offset: Some(10),
            ..Default::default()
        }).unwrap();
        assert_eq!(records.len(), 0);
    }

    #[test]
    fn test_empty_database_aggregation() {
        let db = Database::new_in_memory().unwrap();

        let summary = aggregate_usage(&db, None, None, None, None, GroupBy::None).unwrap();

        assert_eq!(summary.total_requests, 0);
        assert_eq!(summary.total_input_tokens, 0);
        assert_eq!(summary.total_output_tokens, 0);
        assert_eq!(summary.total_tokens, 0);
    }
}
