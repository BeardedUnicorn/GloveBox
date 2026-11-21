//! The saved data's schema: the SQL plugin runs these migrations the first
//! time the web app opens the database (src/storage/sqliteStorage.ts), each
//! one once. The SQL lives in src-tauri/migrations/, where the storage tests
//! also run it against a real SQLite.

use tauri_plugin_sql::{Migration, MigrationKind};

/// The database the web app opens; sqliteStorage.ts names the same one.
pub const DATABASE: &str = "sqlite:glovebox.db";

/// Every migration, oldest first. sqlx checks each one's checksum, so one
/// that has shipped never changes: a schema change is a new migration.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "settings, lessons and sessions",
        sql: include_str!("../migrations/0001_initial.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_database_is_an_sqlite_file() {
        assert_eq!(DATABASE, "sqlite:glovebox.db");
    }

    #[test]
    fn migrations_count_up_from_one_and_all_move_forward() {
        let all = migrations();
        let versions: Vec<i64> = all.iter().map(|m| m.version).collect();
        let expected: Vec<i64> = (1..=all.len() as i64).collect();
        assert_eq!(versions, expected);
        assert!(all.iter().all(|m| matches!(m.kind, MigrationKind::Up)));
        assert!(all.iter().all(|m| !m.description.is_empty()));
    }

    #[test]
    fn the_first_migration_creates_the_tables_the_app_reads() {
        let sql = migrations()[0].sql;
        for table in ["kv", "lessons", "sessions"] {
            assert!(sql.contains(&format!("CREATE TABLE {table} (")), "{table}");
        }
        assert!(
            sql.contains("CREATE INDEX sessions_by_lesson ON sessions (lesson_id, started_at)")
        );
    }
}
