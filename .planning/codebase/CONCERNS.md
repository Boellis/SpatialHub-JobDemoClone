# Codebase Concerns

**Analysis Date:** 2026-03-09

## Tech Debt

**Hardcoded Production URLs Throughout Frontend:**
- Issue: API base URLs are hardcoded directly in page components instead of using the centralized `api.ts` module. Multiple pages bypass `api.ts` entirely and use raw `axios` calls with hardcoded Cloud Run and Cloud Function URLs.
- Files: `spatialhub-frontend/src/pages/SimulateDevices.tsx` (lines 4-7, 34), `spatialhub-frontend/src/pages/SensorTrends.tsx` (line 20), `spatialhub-frontend/src/pages/RawSensorData.tsx` (line 11), `spatialhub-frontend/src/pages/EnrichedSensorData.tsx` (line 11)
- Impact: Changing the backend URL requires editing 5+ files. Environment-based configuration is impossible for these pages. Only `api.ts` respects the `VITE_API_URL` env var.
- Fix approach: Consolidate all API calls into `spatialhub-frontend/src/api/api.ts`. Remove direct `axios` imports from page components. Ensure all calls use the `BASE_URL` with env var support.

**Double `/api/api/` Path Bug in `fetchRawSensorData`:**
- Issue: `api.ts` defines `BASE_URL` as `...run.app/api` and then `fetchRawSensorData` calls `${BASE_URL}/api/raw/`, resulting in the path `/api/api/raw/`. The other functions correctly use `${BASE_URL}/raw/` etc.
- Files: `spatialhub-frontend/src/api/api.ts` (line 6)
- Impact: `fetchRawSensorData` hits a wrong endpoint. The `RawSensorData` page works only because it bypasses `api.ts` entirely and uses a hardcoded URL directly. This function is dead code that would break if actually used.
- Fix approach: Change line 6 to `axios.get(\`${BASE_URL}/raw/\`)`.

**Duplicate Type Definitions:**
- Issue: `SensorData` interface is defined in both `spatialhub-frontend/src/types/types.ts` and `spatialhub-frontend/src/types/index.ts`. The `types.ts` version uses `[key: string]: any` (completely untyped), while `index.ts` has proper field definitions. Additionally, `SensorTrends.tsx` defines its own local `SensorData` interface.
- Files: `spatialhub-frontend/src/types/types.ts`, `spatialhub-frontend/src/types/index.ts`, `spatialhub-frontend/src/pages/SensorTrends.tsx` (lines 5-11)
- Impact: Type safety is undermined. Neither shared type definition is actually imported by any page component -- pages use `any[]` instead.
- Fix approach: Delete `types.ts`, keep `index.ts` as the single source of truth, and import it in all page components instead of using `any[]`.

**Wildcard Import in Serializers:**
- Issue: `from .models import *` is used instead of explicit imports.
- Files: `django_backend/sensor_data/serializers.py` (line 2)
- Impact: Namespace pollution, unclear dependencies, linting violations.
- Fix approach: Replace with `from .models import RawSensorData, EnrichedSensorData, HubConfig`.

**Conflicting Django Version Requirements:**
- Issue: Two `requirements.txt` files specify different Django versions. Root level requires `Django>=5.2`, while `django_backend/requirements.txt` requires `Django>=4.2,<5`. The Dockerfile copies from `django_backend/` so production runs Django 4.x, but developers might install from the root file and get Django 5.x.
- Files: `requirements.txt` (line 3), `django_backend/requirements.txt` (line 1)
- Impact: Dev/prod parity issues. Code written against Django 5.2 features will break in production. The root `requirements.txt` also includes `aiohttp` and `asyncio` which are not used by Django.
- Fix approach: Consolidate to a single `requirements.txt` inside `django_backend/`. Remove the root-level file or make it reference the inner one.

**Committed venv Directory:**
- Issue: `django_backend/venv_local/` is a full Python virtual environment committed to the repository (~600K+ lines of third-party code in the repo).
- Files: `django_backend/venv_local/`
- Impact: Massively bloated repository. Every dependency update creates enormous diffs. Platform-specific binaries may not work cross-platform.
- Fix approach: Add `venv_local/` to `.gitignore`, remove from tracking with `git rm -r --cached django_backend/venv_local/`, and document venv setup in README.

**PaginatedTable Component is Unused:**
- Issue: `PaginatedTable.tsx` exists but both `RawSensorData.tsx` and `EnrichedSensorData.tsx` implement their own inline pagination tables with nearly identical code.
- Files: `spatialhub-frontend/src/components/PaginatedTable.tsx`, `spatialhub-frontend/src/pages/RawSensorData.tsx`, `spatialhub-frontend/src/pages/EnrichedSensorData.tsx`
- Impact: Code duplication. Bug fixes must be applied in multiple places. The reusable component exists but nobody uses it.
- Fix approach: Refactor `RawSensorData` and `EnrichedSensorData` to use `PaginatedTable`.

**Client-Side Pagination Only (No Server-Side Pagination):**
- Issue: All data endpoints (`/api/raw/`, `/api/enriched/`) return the entire dataset. The frontend fetches everything into memory and paginates client-side. `RawSensorListView` uses DRF's `ListAPIView` but has no pagination class configured. `EnrichedSensorListView` is a raw `APIView` with no pagination at all.
- Files: `django_backend/sensor_data/views.py` (lines 15-17, 19-36), `spatialhub-frontend/src/pages/RawSensorData.tsx`, `spatialhub-frontend/src/pages/EnrichedSensorData.tsx`
- Impact: As sensor data grows, API responses become enormous. The browser will eventually run out of memory. Network transfer times will degrade.
- Fix approach: Add `DEFAULT_PAGINATION_CLASS` and `PAGE_SIZE` to `REST_FRAMEWORK` settings, or add pagination to individual views. Update frontend to request pages.

## Known Bugs

**`enrich_data_subscriber` Crashes on DB Error but Still Calls `conn.commit()`:**
- Symptoms: If the `except` block on line 61 catches an error, execution falls through to `conn.commit()` / `conn.close()` on lines 65-67 which are outside the try/except. If the connection itself failed, `conn` is undefined and the function crashes with `NameError`.
- Files: `functions/enrich_data_subscriber/main.py` (lines 27-67)
- Trigger: Any database connection failure or SQL error.
- Workaround: None. The Pub/Sub message will be retried by GCP, potentially causing duplicate inserts for rows that succeeded before the error.

**Hardcoded `sensor_name: 'ph'` in Hub Sync Script:**
- Symptoms: All sensor data synced from the Raspberry Pi is labeled as "ph" regardless of actual sensor type.
- Files: `hubcode/snyc_to_postgres.py` (line 57: `"sensor_name": 'ph',#row[1],`)
- Trigger: Any sensor reading synced from the hub.
- Workaround: None in code. The commented-out `row[1]` suggests this was a debugging artifact that was never reverted.

**Frontend `fetchEnrichedSensorData` Sends `page` Param but Backend Ignores It:**
- Symptoms: The `page` query parameter in `api.ts` line 12 is sent to the backend, but `EnrichedSensorListView` never reads it. All data is always returned.
- Files: `spatialhub-frontend/src/api/api.ts` (line 12), `django_backend/sensor_data/views.py` (lines 19-36)
- Trigger: Any call to `fetchEnrichedSensorData`.
- Workaround: Frontend does client-side pagination anyway, so functionally it works -- just wastefully.

## Security Considerations

**Database Password Hardcoded in Settings:**
- Risk: The PostgreSQL password is hardcoded as a default value in `settings.py` and committed to version control. Anyone with repo access has direct database credentials.
- Files: `django_backend/spatialhub_backend/settings.py` (line 68)
- Current mitigation: Environment variables can override, but the fallback exposes the production password.
- Recommendations: Remove the hardcoded default. Require `DB_PASS` env var. Use GCP Secret Manager or Cloud SQL IAM authentication.

**Django SECRET_KEY Hardcoded with `insecure` Prefix:**
- Risk: The Django secret key is hardcoded and committed. It is used for session signing, CSRF tokens, and cryptographic signing. An attacker could forge sessions.
- Files: `django_backend/spatialhub_backend/settings.py` (line 7)
- Current mitigation: None.
- Recommendations: Generate a proper secret key, store in environment variable or GCP Secret Manager.

**DEBUG = True in Production Settings:**
- Risk: Django debug mode exposes detailed error pages with stack traces, settings values, and database queries to end users.
- Files: `django_backend/spatialhub_backend/settings.py` (line 8)
- Current mitigation: None. The same `settings.py` is used in the Docker/Cloud Run deployment.
- Recommendations: Set `DEBUG = os.environ.get('DEBUG', 'False') == 'True'`.

**ALLOWED_HOSTS = ["*"]:**
- Risk: Accepts requests with any `Host` header, enabling host header injection attacks.
- Files: `django_backend/spatialhub_backend/settings.py` (line 10)
- Current mitigation: None.
- Recommendations: Remove `"*"` and keep only the Cloud Run domain.

**No Authentication on Any API Endpoint:**
- Risk: All API endpoints are completely unauthenticated. Anyone can provision hubs, send pump commands to physical devices, and read all sensor data. The `send-command/` endpoint is particularly dangerous -- it publishes commands to Pub/Sub that control physical pumps.
- Files: `django_backend/sensor_data/views.py` (all views), `django_backend/sensor_data/urls.py`
- Current mitigation: CORS restricts browser-based access to allowed origins, but this does not prevent direct API calls (curl, Postman, scripts).
- Recommendations: Add DRF authentication (token-based or JWT). At minimum, protect `send-command/` and `provision/` endpoints.

**No Input Validation on Cloud Functions:**
- Risk: `ingest_data_publisher` accepts any JSON and publishes it directly to Pub/Sub with zero validation. An attacker can inject arbitrary data into the pipeline.
- Files: `functions/ingest_data_publisher/main.py` (lines 9-23)
- Current mitigation: None. `Access-Control-Allow-Origin: *` makes it callable from any origin.
- Recommendations: Validate required fields (`hub_id`, `sensor_name`, `sensor_val`, etc.) and their types. Add authentication (API key or Firebase Auth).

**GCP Service Account Key Referenced on Device:**
- Risk: The hub code hardcodes a path to a service account JSON file. This file was previously committed to the repo (commit `59d7783` deleted it).
- Files: `hubcode/snyc_to_postgres.py` (line 7)
- Current mitigation: The key file was deleted from HEAD, but it remains in git history.
- Recommendations: Rotate the service account key. Use `git filter-branch` or BFG to purge from history. Consider using workload identity federation instead.

**HubProvisionForm Has No Error Handling:**
- Risk: If `provisionHub` throws, the error is silently swallowed. The `alert('Hub provisioned successfully!')` fires before the async operation completes if the `await` line throws.
- Files: `spatialhub-frontend/src/components/HubProvisionForm.tsx` (lines 9-16)
- Current mitigation: None.
- Recommendations: Add try/catch with user-facing error feedback.

## Performance Bottlenecks

**All Sensor Data Loaded Into Memory:**
- Problem: Both `RawSensorListView` and `EnrichedSensorListView` load the entire dataset via `.objects.all()` with no limit, no pagination, and no date range filtering.
- Files: `django_backend/sensor_data/views.py` (lines 16, 22)
- Cause: No server-side pagination configured. No query parameter support for date ranges.
- Improvement path: Add `PageNumberPagination` to DRF settings. Add date range filters. Add database indexes on `datetime` column.

**No Database Indexes Defined in Django Models:**
- Problem: Models define no indexes. Queries ordering by `-datetime` and filtering by `sensor_name` and `hub_id` will do full table scans as data grows.
- Files: `django_backend/sensor_data/models.py`
- Cause: No `Meta.indexes` or `db_index=True` on any field.
- Improvement path: Add indexes on `datetime`, `hub_id`, and `sensor_name` for `RawSensorData` and `EnrichedSensorData`.

**SensorTrends Fetches All Enriched Data on Every Mount:**
- Problem: The trends page loads the entire enriched dataset into the browser, then filters client-side. With thousands of sensor readings, this creates huge network transfers and slow rendering.
- Files: `spatialhub-frontend/src/pages/SensorTrends.tsx` (lines 19-27)
- Cause: No server-side filtering by sensor type or date range. The `groupedData` computation uses `.find()` in a loop (O(n^2)).
- Improvement path: Use query parameters to filter on the backend. Convert `groupedData` construction to use a Map for O(n) grouping.

**Hub Sync Script Publishes One Row at a Time:**
- Problem: `snyc_to_postgres.py` publishes each row individually to Pub/Sub, waiting for each `future.result()` synchronously.
- Files: `hubcode/snyc_to_postgres.py` (lines 49-73)
- Cause: Sequential publishing pattern.
- Improvement path: Batch publish or use async futures. The Pub/Sub client supports batching natively.

## Fragile Areas

**Cloud Function `enrich_data_subscriber` Error Handling:**
- Files: `functions/enrich_data_subscriber/main.py`
- Why fragile: The try/except on lines 27-62 catches exceptions but falls through to `conn.commit()` / `conn.close()` outside the try block. If `conn` was never created (connection failure), the function crashes with `NameError`. If some inserts succeeded before an error, partial data gets committed on retry, causing duplicates.
- Safe modification: Wrap the entire function body in try/finally. Use context managers for the database connection. Add idempotency checks (upsert or dedup key).
- Test coverage: Zero. No test files exist for cloud functions.

**Django Models Must Match Cloud Function SQL:**
- Files: `django_backend/sensor_data/models.py`, `functions/enrich_data_subscriber/main.py`
- Why fragile: Django models use `db_table` to point at tables that are also written to directly by Cloud Functions using raw SQL. Schema changes via Django migrations could break the Cloud Function inserts, or vice versa. There is no shared schema definition.
- Safe modification: Always check both Django models AND Cloud Function SQL when changing table schemas. Run migrations on a staging database first.
- Test coverage: None.

**Frontend Data Shape Assumptions:**
- Files: `spatialhub-frontend/src/pages/RawSensorData.tsx` (line 13: `res.data.flat()`), `spatialhub-frontend/src/pages/SensorTrends.tsx` (line 22: nested array check)
- Why fragile: Pages use `.flat()` on API responses, suggesting the API sometimes returns nested arrays. The shape is unpredictable and pages use different defensive strategies. All data is typed as `any[]`.
- Safe modification: Pin down the API response format. Add TypeScript types. Remove `.flat()` calls once the response shape is guaranteed.
- Test coverage: Zero frontend tests exist.

## Scaling Limits

**PostgreSQL Direct Connection from Cloud Functions:**
- Current capacity: Cloud Functions create a new `psycopg2` connection per invocation.
- Limit: Cloud SQL has a max connection limit (~100-500 depending on tier). Under high ingest load, connection exhaustion will cause failures.
- Scaling path: Use Cloud SQL Connector or Cloud SQL Auth Proxy with connection pooling. Consider PgBouncer.

**No Rate Limiting on Ingest Endpoint:**
- Current capacity: Unlimited. Any client can POST unlimited payloads to `ingest_data_publisher`.
- Limit: Cloud Function concurrency and database capacity.
- Scaling path: Add rate limiting, API key authentication, or quotas.

## Dependencies at Risk

**No Lockfile for Python Dependencies:**
- Risk: Neither `requirements.txt` pins exact versions (except `google-cloud-pubsub`). Builds are not reproducible. A breaking change in any dependency will silently break production.
- Impact: `pip install -r requirements.txt` can install different versions on different days.
- Migration plan: Generate `requirements.txt` with pinned versions using `pip freeze`. Consider using `pip-tools` or `poetry`.

## Missing Critical Features

**Zero Test Coverage:**
- Problem: `django_backend/sensor_data/tests.py` is an empty stub. No frontend tests exist. No Cloud Function tests exist. No hub code tests exist.
- Blocks: Confident refactoring, CI/CD pipelines, regression detection.

**No Logging Framework:**
- Problem: Django views use `print()` for error logging. Cloud Functions use `print()`. Only hub code uses Python `logging`. There is no structured logging, no log aggregation, no error tracking service.
- Blocks: Production debugging, alerting on errors, audit trails.

**No CI/CD Pipeline:**
- Problem: No GitHub Actions, Cloud Build, or any CI configuration exists. Deployments are presumably manual.
- Blocks: Automated testing, consistent deployments, code quality enforcement.

**No Environment Configuration Management:**
- Problem: No `.env.example` file documents required environment variables. Settings hardcode production values as defaults. Developers must reverse-engineer required config from `settings.py`.
- Blocks: Onboarding new developers, safe local development.

## Test Coverage Gaps

**Entire Codebase is Untested:**
- What's not tested: Everything. Django views, models, serializers, Cloud Functions, hub code, frontend components.
- Files: `django_backend/sensor_data/tests.py` (empty), no test files in `functions/`, no test files in `hubcode/`, no test files in `spatialhub-frontend/src/`
- Risk: Any change can break anything with zero detection. The `enrich_data_subscriber` bug (conn.commit outside try/except) would have been caught by even basic testing.
- Priority: High. Start with Django API views (most impactful) and `enrich_data_subscriber` (most buggy).

---

*Concerns audit: 2026-03-09*
