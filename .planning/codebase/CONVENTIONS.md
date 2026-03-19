# Coding Conventions

**Analysis Date:** 2026-03-09

## Naming Patterns

**Files (Python - Django):**
- snake_case for all modules: `models.py`, `views.py`, `serializers.py`, `urls.py`
- Standard Django app structure: `sensor_data/` app with canonical file names
- Cloud Functions use `main.py` as entry point in each function directory

**Files (Python - Hub Code):**
- snake_case: `sensor_logger.py`, `basic_funcs.py`, `pump_handler.py`
- Exception: `AtlasI2C.py` uses PascalCase (matches the class name inside)

**Files (TypeScript/React):**
- PascalCase for page components: `RawSensorData.tsx`, `EnrichedSensorData.tsx`, `SensorTrends.tsx`
- PascalCase for reusable components: `PaginatedTable.tsx`, `HubProvisionForm.tsx`
- camelCase for non-component modules: `api.ts`
- Lowercase for type files: `types.ts`, `index.ts`

**Functions (Python):**
- snake_case throughout: `generate_hub_id()`, `insert_sensor_data()`, `query_sensor()`
- Django views use PascalCase class names: `RawSensorListView`, `EnrichedSensorListView`, `SendHubCommand`
- Cloud Function entry points are snake_case: `ingest_data_publisher()`, `enrich_data()`, `send_command()`

**Functions (TypeScript):**
- camelCase for API functions: `fetchRawSensorData()`, `fetchEnrichedSensorData()`, `provisionHub()`
- camelCase for event handlers: `handleSubmit`, `simulateBatch`, `sendPumpCommand`
- camelCase for utility functions: `getRandomValue()`, `sendPayload()`

**Variables (Python):**
- UPPER_SNAKE_CASE for module-level constants: `HUB_ID`, `SENSOR_ADDR`, `DB_FILE`, `CLOUD_FUNCTION_URL`
- snake_case for local variables: `hub_id`, `sensor_name`, `device_addr`

**Variables (TypeScript):**
- camelCase for state variables: `currentPage`, `selectedSensor`, `selectedHub`
- camelCase for constants within components: `itemsPerPage`, `sensorTypes`
- UPPER_SNAKE_CASE for module-level URL constants: `CLOUD_FUNCTION_URL`, `COMMAND_URL`

**Types/Interfaces (TypeScript):**
- PascalCase: `SensorData`, `PaginatedTableProps`, `SensorName`
- Interfaces used for component props and data shapes
- Type aliases used for union types: `type SensorName = "ph" | "do" | ...`

**Django Models:**
- PascalCase class names: `RawSensorData`, `EnrichedSensorData`, `HubConfig`
- snake_case field names: `hub_id`, `sensor_name`, `sensor_val`
- Explicit `db_table` in Meta class for all models (shared tables with Cloud Functions)

**React Components:**
- PascalCase for component names: `RawSensorData`, `SensorTrends`, `SimulateDevices`
- Mixed export styles (see Exports section below)

## Code Style

**Formatting:**
- No Prettier config detected -- no automated formatting enforced
- Python: No `black`, `ruff`, or `flake8` config detected
- Indentation: 4 spaces for Python, 2 spaces for TypeScript/TSX

**Linting:**
- Frontend: ESLint 9 with flat config at `spatialhub-frontend/eslint.config.js`
  - Uses `@eslint/js` recommended rules
  - Uses `typescript-eslint` recommended rules
  - `eslint-plugin-react-hooks` with recommended rules
  - `eslint-plugin-react-refresh` (warns on non-component exports)
- Python: No linting tools configured
- TypeScript: `strict: true` in `spatialhub-frontend/tsconfig.app.json` with `noUnusedLocals` and `noUnusedParameters`

## Import Organization

**Python (Django views - `django_backend/sensor_data/views.py`):**
1. Framework imports (`from rest_framework...`)
2. Third-party imports (`from google.cloud import pubsub_v1`)
3. Standard library imports (`import json`, `import secrets`)
4. Local imports (`from .models import ...`)

Note: Import order is inconsistent -- stdlib imports appear after third-party in `views.py`. No `isort` or import ordering tool is configured.

**Python (Cloud Functions):**
- Standard library and third-party mixed freely
- No consistent ordering

**TypeScript (React components):**
1. React imports (`import { useEffect, useState } from "react"`)
2. Third-party imports (`import axios from "axios"`)
3. Local imports (`from '../api/api'`)

No path aliases configured. All imports use relative paths.

**Python wildcard import:**
- `django_backend/sensor_data/serializers.py` uses `from .models import *` -- avoid this pattern. Use explicit imports.

## Error Handling

**Django Views (`django_backend/sensor_data/views.py`):**
- Broad `try/except Exception as e` wrapping entire view methods
- Errors logged via `print()` and `traceback.print_exc()` (no structured logging)
- Returns `{"error": str(e)}` with HTTP 500 to the client
- Exception messages exposed directly to API consumers (leaks internal details)
- Pattern used in: `EnrichedSensorListView`, `HubListView`, `HubProvisionView`, `SendHubCommand`
- `RawSensorListView` (using `ListAPIView`) has NO error handling -- relies on DRF defaults

```python
# Current pattern in views.py - every APIView method:
try:
    # ... logic ...
except Exception as e:
    print("Error in ViewName:", str(e))
    traceback.print_exc()
    return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
```

**Cloud Functions (`functions/`):**
- Same broad `try/except Exception` pattern
- Returns error string directly in response body
- `enrich_data_subscriber/main.py` has a bug: `conn.commit()` / `conn.close()` are outside the try/except -- will crash if connection fails

**Hub Code (`hubcode/`):**
- Uses Python `logging` module properly (the only layer that does)
- Retries sensor reads up to 3 times in `sensor_logger.py`
- Pub/Sub callback in `basic_funcs.py` properly acks/nacks messages based on success/failure

**Frontend (React):**
- `.catch((err) => console.error(...))` on API calls -- no user-facing error messages
- `HubProvisionForm` has no error handling at all -- `await provisionHub(...)` is unguarded
- `alert()` used for success feedback (no toast/notification system despite `@radix-ui/react-toast` being installed)

## Logging

**Framework:** Mixed -- `print()` in Django/Cloud Functions, `logging` module in hub code, `console.error` in frontend

**Django Backend:** Use `print()` statements for all logging. No structured logging, no log levels, no logger configuration.

**Cloud Functions:** Use `print()` with f-strings. GCP captures stdout as logs automatically, but there is no severity/level control.

**Hub Code:** Uses Python `logging` module properly with `logging.basicConfig()`, file output, and appropriate log levels (`info`, `warning`, `error`, `debug`).

**Frontend:** `console.error()` for API failures. No logging framework.

**Prescriptive guidance:** For new Django views, continue with `print()` to match existing pattern, but this is a known debt item. For hub code, use the `logging` module. For frontend, use `console.error()`.

## Comments

**When Comments Appear:**
- Inline comments explaining "what" not "why" (e.g., `# Tell Django to use the existing table`)
- Some commented-out code left in place (`basic_funcs.py` line 77: `#hub_ids = [generate_hub_id()...]`)
- Commented-out debug statements (e.g., `#print("yessir type shit")` in `basic_funcs.py` line 83)
- Section headers using `# === Section Name ===` pattern in hub code

**JSDoc/TSDoc:** Not used anywhere in the frontend codebase.

**Python Docstrings:** Only in `simulate_devices.py` (module-level and per-function). Django app has zero docstrings.

## Function Design

**Size:** Functions are generally small (under 30 lines). Views are single-method classes.

**Parameters:**
- Python: Positional parameters, no type hints except in `basic_funcs.py` (`payload: dict`)
- TypeScript: Type annotations on function signatures are inconsistent -- `fetchRawSensorData` uses `Promise<any[]>` return type but `_page` parameter is unused

**Return Values:**
- Django views: Always return `Response(...)` with explicit status codes
- Cloud Functions: Return tuples of `(body, status_code, headers)`
- Frontend API functions: Return unwrapped response data via `.then(res => res.data)`

## Module/Export Design

**Exports (TypeScript):**
- Mixed named and default exports with no consistent pattern:
  - Named exports: `RawSensorData`, `EnrichedSensorData`, `ProvisionHub`, `PaginatedTable`, `HubProvisionForm`
  - Default exports: `SimulateDevices`, `UnityEmbed`, `App`
- Prescriptive: Use named exports for page components and reusable components. Use default export only for the root `App` component.

**Barrel Files:**
- `spatialhub-frontend/src/types/index.ts` re-exports `SensorData` interface, but pages import `SensorData` directly or redefine it locally (see `SensorTrends.tsx` line 5 which redeclares the interface)

**Django App Structure:**
- Standard single-app layout: `models.py`, `views.py`, `serializers.py`, `urls.py`, `admin.py`
- All models, views, serializers in single files (no splitting yet)

## API URL Patterns

**Backend (`django_backend/sensor_data/urls.py`):**
- RESTful-ish paths under `/api/`: `raw/`, `enriched/`, `hub/`, `provision/`, `send-command/`
- Trailing slashes enforced (Django default)

**Frontend API calls:**
- INCONSISTENT: Some pages use the centralized API module (`spatialhub-frontend/src/api/api.ts`), others hardcode URLs directly in components
  - `RawSensorData.tsx`: Hardcodes full Cloud Run URL directly in `useEffect`
  - `EnrichedSensorData.tsx`: Hardcodes full Cloud Run URL directly in `useEffect`
  - `SensorTrends.tsx`: Hardcodes full Cloud Run URL directly in `useEffect`
  - `SimulateDevices.tsx`: Hardcodes Cloud Function and Cloud Run URLs as module constants
  - `ProvisionHub.tsx`: Uses `provisionHub` from `api.ts` (the correct pattern)
- Prescriptive: ALL API calls should go through `spatialhub-frontend/src/api/api.ts`. Do not hardcode URLs in components.

## State Management

**Frontend:**
- Local component state via `useState` hooks -- no global state management
- `@tanstack/react-query` is installed in `package.json` but NOT used anywhere
- Data fetching done with raw `axios` calls in `useEffect` hooks
- No loading states, no error states displayed to users
- Prescriptive: Use `@tanstack/react-query` for data fetching (it is already a dependency)

## CSS/Styling

**Approach:** Tailwind CSS utility classes applied directly in JSX
- No component library (despite Radix UI toast being installed)
- No CSS modules, no styled-components
- Inline Tailwind classes: `className="p-4"`, `className="text-xl font-bold mb-4"`
- Some components have no Tailwind classes at all (`HubProvisionForm.tsx`, `PaginatedTable.tsx` table element)

## Type Safety

**TypeScript strictness:** `strict: true` is enabled but widely undermined:
- `any` used liberally: `useState<any[]>([])` in `RawSensorData.tsx`, `EnrichedSensorData.tsx`
- `PaginatedTableProps` uses `data: any[]`
- `SensorData` interface in `types/types.ts` uses `[key: string]: any` (completely defeats type safety)
- A proper `SensorData` interface exists in `types/index.ts` but is rarely imported
- `SensorTrends.tsx` redefines its own local `SensorData` interface instead of importing

**Prescriptive:** Import types from `spatialhub-frontend/src/types/index.ts`. Do not use `any` for sensor data shapes. Do not redefine types locally.

---

*Convention analysis: 2026-03-09*
