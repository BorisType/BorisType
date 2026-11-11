-- Metadata only. Run on the selected HCM database with psql -X -qAt -v ON_ERROR_STOP=1.
-- A read-only snapshot does not establish document-save transaction semantics.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';

SELECT json_build_object(
  'database', current_database(),
  'serverVersion', current_setting('server_version'),
  'tables', (
    SELECT json_agg(t ORDER BY t.schema_name, t.table_name)
    FROM (
      SELECT n.nspname AS schema_name, c.relname AS table_name,
             c.relkind AS relation_kind,
             c.reltuples AS estimated_rows,
             pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND c.relkind IN ('r', 'p', 'v', 'm')
    ) t
  ),
  'columns', (
    SELECT json_agg(t ORDER BY t.table_schema, t.table_name, t.ordinal_position)
    FROM (
      SELECT table_schema, table_name, column_name, ordinal_position,
             data_type, udt_name, is_nullable,
             column_default IS NOT NULL AS has_default
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ) t
  ),
  'constraints', (
    SELECT json_agg(t ORDER BY t.schema_name, t.table_name, t.constraint_name)
    FROM (
      SELECT n.nspname AS schema_name, c.relname AS table_name,
             co.conname AS constraint_name, co.contype AS constraint_type,
             co.convalidated AS validated,
             CASE WHEN co.confrelid <> 0 THEN co.confrelid::regclass::text END AS referenced_table
      FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    ) t
  ),
  'indexes', (
    SELECT json_agg(t ORDER BY t.schemaname, t.tablename, t.indexname)
    FROM (
      SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ) t
  )
);
COMMIT;
