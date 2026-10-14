# Heart analytics (GA4 → BigQuery)

The GA4 property for juleflet.dk (516612715) exports its raw events once a day
to BigQuery: project `thomasdybdahlahle`, dataset `analytics_516612715`, one
table per day named `events_YYYYMMDD` (EU location, first table 2026-10-15).
The project has no billing account, so it runs in the BigQuery sandbox: free,
10 GB of storage and 1 TB of queries per month, far above what this needs.

The site sends, without cookies, these events with a `heart_id` parameter:
`view_heart`, `select_heart` (with `selected`), `download_heart`,
`share_heart` (with `share_method`), `edit_heart`. Every `download_heart` of
one PDF carries the same `download_id` and the basket size `download_count`,
which is what makes "downloaded together" answerable.

## Running the queries

Both scripts take a date range through query parameters, e.g. the last 90 days:

    bq query --project_id=thomasdybdahlahle --use_legacy_sql=false \
      --parameter=start:STRING:20261015 --parameter=end:STRING:20261231 \
      < scripts/analytics/heart_stats.sql

- `heart_stats.sql` — per heart: views, selections, downloads (in how many
  PDFs, and how many as the only heart), shares and editor opens. Use it to
  decide which templates to keep.
- `co_downloads.sql` — pairs of hearts printed in the same PDF, with the pair
  count and a lift score (how much more often than chance). The `rank` column
  gives each heart's best partners first; this is the input for
  "others also printed" recommendations.
- `recommendations.mjs` — runs `co_downloads.sql` through `bq` and writes a
  JSON map `{ heartId: [partnerId, ...] }` (top 6 per heart), ready to be
  committed as site data once there is enough traffic to make it meaningful.

    node scripts/analytics/recommendations.mjs 20261015 20261231 > recommendations.json

`bq` is the BigQuery CLI from the Google Cloud SDK, signed in as the account
that owns the Analytics property.
