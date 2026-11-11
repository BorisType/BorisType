-- Optional aggregates only: no IDs, individual URLs, XML, or blob payloads.
-- Counts can scan service tables; statement_timeout is intentional.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';

SELECT json_build_object(
  'registryObjects', (SELECT count(*) FROM dbo."(spxml_objects)"),
  'blobsByRootAndExtension', (
    SELECT json_agg(t ORDER BY t.known_root, t.ext)
    FROM (
      SELECT CASE
               WHEN url LIKE 'x-local://wtv/%' THEN 'x-local://wtv/'
               WHEN url LIKE 'x-local://wt\_data/%' ESCAPE '\' THEN 'x-local://wt_data/'
               ELSE '(other)'
             END AS known_root,
             ext, count(*) AS count
      FROM dbo."(spxml_blobs)"
      GROUP BY 1, 2
    ) t
  )
);
COMMIT;
