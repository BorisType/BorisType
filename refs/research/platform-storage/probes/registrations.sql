-- HCM PostgreSQL metadata, not business document contents.
-- Requires the observed dbo service-table layout; inspect schema.sql first.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';

SELECT json_build_object(
  'metadata', (
    SELECT json_agg(t ORDER BY t.schema, t.form)
    FROM (
      SELECT schema, form, tablename, doc_list, primary_key, parent_id_elem,
             spxml_form, spxml_form_elem, spxml_form_type, ft_idx
      FROM dbo."(spxml_metadata)"
    ) t
  ),
  'foreignKeys', (
    SELECT json_agg(t ORDER BY t.table_name, t.conname)
    FROM (
      SELECT c.oid::regclass::text AS table_name, co.conname,
             pg_get_constraintdef(co.oid) AS definition
      FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'dbo' AND co.contype = 'f'
    ) t
  )
);
COMMIT;
