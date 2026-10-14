-- Per-heart engagement over a date range. Parameters: @start, @end as YYYYMMDD.
WITH events AS (
  SELECT
    event_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'heart_id') AS heart_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'heart_name') AS heart_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'download_id') AS download_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'download_count') AS download_count,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'selected') AS selected
  FROM `thomasdybdahlahle.analytics_516612715.events_*`
  WHERE _TABLE_SUFFIX BETWEEN @start AND @end
    AND event_name IN ('view_heart', 'select_heart', 'download_heart', 'share_heart', 'edit_heart')
)
SELECT
  heart_id,
  ANY_VALUE(heart_name) AS heart_name,
  COUNTIF(event_name = 'view_heart') AS views,
  COUNTIF(event_name = 'select_heart' AND selected = 'true') AS selections,
  COUNT(DISTINCT IF(event_name = 'download_heart', download_id, NULL)) AS pdfs,
  COUNTIF(event_name = 'download_heart' AND download_count = 1) AS solo_downloads,
  COUNTIF(event_name = 'share_heart') AS shares,
  COUNTIF(event_name = 'edit_heart') AS editor_opens
FROM events
WHERE heart_id IS NOT NULL
GROUP BY heart_id
ORDER BY pdfs DESC, views DESC;
