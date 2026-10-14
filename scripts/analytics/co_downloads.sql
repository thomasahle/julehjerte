-- Hearts printed in the same PDF. Parameters: @start, @end as YYYYMMDD.
-- One row per ordered pair (a, b): how many PDFs held both, and the lift
-- relative to chance, so popular hearts do not dominate every list.
WITH downloads AS (
  SELECT DISTINCT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'download_id') AS download_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'heart_id') AS heart_id
  FROM `thomasdybdahlahle.analytics_516612715.events_*`
  WHERE _TABLE_SUFFIX BETWEEN @start AND @end
    AND event_name = 'download_heart'
),
baskets AS (
  SELECT download_id, heart_id FROM downloads WHERE download_id IS NOT NULL AND heart_id IS NOT NULL
),
per_heart AS (
  SELECT heart_id, COUNT(DISTINCT download_id) AS pdfs FROM baskets GROUP BY heart_id
),
total AS (
  SELECT COUNT(DISTINCT download_id) AS pdfs FROM baskets
),
pairs AS (
  SELECT a.heart_id AS heart_a, b.heart_id AS heart_b, COUNT(DISTINCT a.download_id) AS together
  FROM baskets a
  JOIN baskets b ON a.download_id = b.download_id AND a.heart_id != b.heart_id
  GROUP BY heart_a, heart_b
)
SELECT
  p.heart_a,
  p.heart_b,
  p.together,
  pa.pdfs AS pdfs_a,
  pb.pdfs AS pdfs_b,
  -- P(b | a) / P(b): above 1 means b goes with a more than its popularity explains.
  ROUND(SAFE_DIVIDE(p.together * t.pdfs, pa.pdfs * pb.pdfs), 2) AS lift,
  ROW_NUMBER() OVER (PARTITION BY p.heart_a ORDER BY p.together DESC, pb.pdfs DESC) AS rank
FROM pairs p
JOIN per_heart pa ON pa.heart_id = p.heart_a
JOIN per_heart pb ON pb.heart_id = p.heart_b
CROSS JOIN total t
WHERE p.together >= 2
ORDER BY p.heart_a, rank;
