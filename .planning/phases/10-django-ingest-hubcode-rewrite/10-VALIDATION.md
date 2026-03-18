---
phase: 10
slug: django-ingest-hubcode-rewrite
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7+ with pytest-django 4+ |
| **Config file** | `django_backend/pytest.ini` |
| **Quick run command** | `cd django_backend && python -m pytest sensor_data/tests/test_pi_ingest.py -x` |
| **Full suite command** | `cd django_backend && python -m pytest sensor_data/tests/ -x` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd django_backend && python -m pytest sensor_data/tests/test_pi_ingest.py -x`
- **After every plan wave:** Run `cd django_backend && python -m pytest sensor_data/tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 0 | INGEST-01 | integration | `pytest sensor_data/tests/test_pi_ingest.py -x` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 0 | HUB-03 | unit | `pytest sensor_data/tests/test_atlas_i2c.py -x` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 0 | HUB-04, HUB-01 | unit | `pytest sensor_data/tests/test_hub_client.py -x` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | INGEST-01 | integration | `pytest sensor_data/tests/test_pi_ingest.py::test_single_payload_stored -x` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | INGEST-01 | integration | `pytest sensor_data/tests/test_pi_ingest.py::test_batch_payload_stored -x` | ❌ W0 | ⬜ pending |
| 10-02-03 | 02 | 1 | INGEST-01 | unit | `pytest sensor_data/tests/test_pi_ingest.py::test_missing_field_returns_400 -x` | ❌ W0 | ⬜ pending |
| 10-02-04 | 02 | 1 | INGEST-01 | unit | `pytest sensor_data/tests/test_pi_ingest.py::test_invalid_sensor_val_returns_400 -x` | ❌ W0 | ⬜ pending |
| 10-02-05 | 02 | 1 | INGEST-01 | unit | `pytest sensor_data/tests/test_pi_ingest.py::test_invalid_datetime_returns_400 -x` | ❌ W0 | ⬜ pending |
| 10-02-06 | 02 | 1 | INGEST-02 | integration | `pytest sensor_data/tests/test_pi_ingest.py::test_hub_id_is_pi_value -x` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 1 | HUB-03 | unit | `pytest hubcode/tests/test_atlas_i2c.py::test_read_value_no_truncation -x` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 1 | HUB-03 | unit | `pytest hubcode/tests/test_atlas_i2c.py::test_read_value_error_code -x` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 1 | HUB-04 | unit | `pytest hubcode/tests/test_hub_client.py::test_buffer_writing -x` | ❌ W0 | ⬜ pending |
| 10-04-02 | 04 | 1 | HUB-04 | unit | `pytest hubcode/tests/test_hub_client.py::test_prune_after_sync -x` | ❌ W0 | ⬜ pending |
| 10-04-03 | 04 | 1 | HUB-01 | unit | `pytest hubcode/tests/test_hub_client.py::test_env_loading -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `django_backend/sensor_data/tests/test_pi_ingest.py` — stubs for INGEST-01, INGEST-02
- [ ] `hubcode/tests/test_atlas_i2c.py` — stubs for HUB-03
- [ ] `hubcode/tests/test_hub_client.py` — stubs for HUB-04, HUB-01

*Test framework (pytest + pytest-django) already configured via `django_backend/pytest.ini`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pi client reads real I2C pH sensor | HUB-02 | Requires physical Atlas Scientific EZO sensor on I2C bus | Run `python hub_client.py --test` on Pi with sensor connected; verify reading + POST |
| Pi auto-detects I2C devices | HUB-05 | Requires real I2C bus with devices | Run `python hub_client.py --test`; verify "Detected I2C devices" banner lists sensor address |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
