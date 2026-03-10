# Deferred Items — Phase 01 Data Foundation

## Pre-existing ESLint Errors (out of scope for Plan 01-02)

These errors existed before Plan 01-02 execution and are NOT caused by simulation engine changes.
They should be fixed in a dedicated linting cleanup task or as part of whichever plan touches those files.

| File | Line | Error |
|------|------|-------|
| `spatialhub-frontend/src/api/api.ts` | 7:42 | `'page' is assigned a value but never used` |
| `spatialhub-frontend/src/components/PaginatedTable.tsx` | 5:9 | `Unexpected any. Specify a different type` |
| `spatialhub-frontend/src/pages/EnrichedSensorData.tsx` | 5:36 | `Unexpected any. Specify a different type` |
| `spatialhub-frontend/src/pages/RawSensorData.tsx` | 5:36 | `Unexpected any. Specify a different type` |
| `spatialhub-frontend/src/pages/SensorTrends.tsx` | 38:39 | `Unexpected any. Specify a different type` |
| `spatialhub-frontend/src/pages/SimulateDevices.tsx` | 35:49, 52:39 | `Unexpected any. Specify a different type` |
| `spatialhub-frontend/src/types/types.ts` | 3:20 | `Unexpected any. Specify a different type` |

**Verified pre-existing:** Confirmed via `git stash` rollback — same errors present in codebase prior to any Plan 01-02 changes.
