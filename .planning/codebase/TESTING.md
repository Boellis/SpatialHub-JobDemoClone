# Testing Patterns

**Analysis Date:** 2026-03-09

## Test Framework

**Runner:**
- Django: `django.test.TestCase` (built-in) -- available but not used
- Frontend: No test runner installed. No Jest, Vitest, or any other test framework in `spatialhub-frontend/package.json`
- Cloud Functions: No test framework
- Hub Code: No test framework

**Assertion Library:**
- None configured anywhere

**Run Commands:**
```bash
# Django (the only layer with test infrastructure)
cd django_backend && python manage.py test sensor_data

# Frontend - NO test command exists
# No "test" script in package.json
```

## Test File Organization

**Location:**
- Django: Co-located at `django_backend/sensor_data/tests.py` (empty placeholder)
- Frontend: No test files exist
- Cloud Functions: No test files exist
- Hub Code: No test files exist

**Naming:**
- Django convention would be `tests.py` or `tests/` directory -- only the empty file exists

**Structure:**
```
django_backend/
  sensor_data/
    tests.py          # Empty - just "from django.test import TestCase" and a comment
```

## Test Structure

**Suite Organization:**
There are zero tests in the entire codebase. The only test file is:

```python
# django_backend/sensor_data/tests.py
from django.test import TestCase

# Create your tests here.
```

This is Django's auto-generated placeholder. No test has ever been written.

## Mocking

**Framework:** Not applicable -- no tests exist

**What Would Need Mocking (guidance for future tests):**

Django views:
- `google.cloud.pubsub_v1.PublisherClient` in `SendHubCommand` view (`django_backend/sensor_data/views.py`)
- Database queries (or use Django's test database)

Cloud Functions:
- `psycopg2.connect` in `functions/enrich_data_subscriber/main.py`
- `pubsub_v1.PublisherClient` in `functions/ingest_data_publisher/main.py` and `functions/command_publisher/main.py`
- HTTP request objects passed to Cloud Function entry points

Hub Code:
- `AtlasI2C` I2C device interactions in `hubcode/sensor_logger.py` and `hubcode/pump_handler.py`
- `sqlite3.connect` for local database in `hubcode/basic_funcs.py`
- `pubsub_v1.PublisherClient` and `pubsub_v1.SubscriberClient` in `hubcode/basic_funcs.py`

Frontend:
- `axios` HTTP calls (or use MSW for request interception)
- No component rendering tests exist -- would need React Testing Library

## Fixtures and Factories

**Test Data:**
- No fixtures, factories, or seed data scripts exist
- `simulate_devices.py` at the repo root is a manual load-testing script (not a test), using `aiohttp` to POST to the real Cloud Function
- `SimulateDevices.tsx` page provides a UI for the same purpose -- also hits real endpoints

**Prescriptive guidance for creating test fixtures:**

```python
# Suggested fixture pattern for Django tests
from django.test import TestCase
from sensor_data.models import HubConfig, RawSensorData, EnrichedSensorData

class SensorDataTestCase(TestCase):
    def setUp(self):
        self.hub = HubConfig.objects.create(
            location="Test Farm",
            owner=["test_owner"],
            workers=["worker1", "worker2"]
        )
        self.raw_reading = RawSensorData.objects.create(
            hub_id=self.hub.hub_id,
            sensor_name="ph",
            device_addr="99",
            sensor_val=7.2,
            datetime="2026-03-09T12:00:00Z",
            sensor_id=f"{self.hub.hub_id}_99"
        )
```

## Coverage

**Requirements:** None enforced. Zero test coverage across the entire codebase.

**View Coverage:**
```bash
# Not configured. To add coverage for Django:
pip install coverage
coverage run manage.py test sensor_data
coverage report
coverage html  # generates htmlcov/
```

## Test Types

**Unit Tests:**
- None exist
- Candidates: Model methods (`generate_hub_id`), serializer validation, view logic, Cloud Function data processing

**Integration Tests:**
- None exist
- Candidates: Django API endpoint tests using `APITestCase`, Cloud Function end-to-end with mock Pub/Sub

**E2E Tests:**
- Not used
- No Cypress, Playwright, or Selenium configured
- The `simulate_devices.py` script is the closest thing to an integration/E2E test but it hits production endpoints and has no assertions

## Common Patterns

**What Tests Should Cover (priority order):**

1. **Django API endpoints** (`django_backend/sensor_data/views.py`):
   - `GET /api/raw/` returns sensor data list
   - `GET /api/enriched/` with and without query params (`sensor_name`, `hub_id`)
   - `POST /api/provision/` creates a hub with auto-generated ID
   - `POST /api/send-command/` validates required fields and publishes to Pub/Sub
   - Error responses for invalid data

2. **Django Models** (`django_backend/sensor_data/models.py`):
   - `generate_hub_id()` produces 20-character alphanumeric strings
   - `HubConfig` auto-generates `hub_id` on create
   - Model field constraints and validation

3. **Django Serializers** (`django_backend/sensor_data/serializers.py`):
   - Serialization/deserialization of all three models
   - Validation rules (currently using `fields = '__all__'` with no custom validation)

4. **Cloud Function logic** (`functions/enrich_data_subscriber/main.py`):
   - JSON parsing of Pub/Sub messages
   - Raw data insertion
   - Enrichment lookup and enriched data insertion
   - Handling of missing hub config (no enrichment)

5. **Frontend components** (if a test framework is added):
   - Component rendering
   - API call integration with React Query (once migrated)
   - Form submission in `HubProvisionForm`

**Suggested test framework setup for frontend:**
```bash
cd spatialhub-frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

```typescript
// vite.config.ts addition
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

**Suggested Django test pattern:**
```python
# django_backend/sensor_data/tests.py
from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status
from unittest.mock import patch, MagicMock
from sensor_data.models import HubConfig, RawSensorData

class HubProvisionTests(APITestCase):
    def test_provision_creates_hub(self):
        response = self.client.post('/api/provision/', {
            'location': 'Test Farm',
            'owner': ['owner1'],
            'workers': ['worker1']
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['hub_id']), 20)

    def test_provision_generates_unique_ids(self):
        r1 = self.client.post('/api/provision/', {'location': 'A', 'owner': [], 'workers': []}, format='json')
        r2 = self.client.post('/api/provision/', {'location': 'B', 'owner': [], 'workers': []}, format='json')
        self.assertNotEqual(r1.data['hub_id'], r2.data['hub_id'])

class SendCommandTests(APITestCase):
    @patch('sensor_data.views.pubsub_v1.PublisherClient')
    def test_send_command_requires_hub_id(self, mock_pub):
        response = self.client.post('/api/send-command/', {'command': 'D,10'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('sensor_data.views.pubsub_v1.PublisherClient')
    def test_send_command_publishes(self, mock_pub):
        mock_instance = MagicMock()
        mock_pub.return_value = mock_instance
        mock_instance.topic_path.return_value = 'projects/test/topics/hub-commands'
        mock_instance.publish.return_value.result.return_value = 'msg123'

        response = self.client.post('/api/send-command/', {
            'hub_id': 'test123',
            'command': 'D,10'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
```

## Environment for Testing

**Django test database:**
- Set `USE_SQLITE=1` environment variable to use SQLite for tests instead of Cloud SQL
- Configured in `django_backend/spatialhub_backend/settings.py` lines 54-60

```bash
USE_SQLITE=1 python manage.py test sensor_data
```

**Frontend:**
- No test environment configured
- `VITE_API_URL` env var can override the hardcoded API base URL in `spatialhub-frontend/src/api/api.ts`

---

*Testing analysis: 2026-03-09*
