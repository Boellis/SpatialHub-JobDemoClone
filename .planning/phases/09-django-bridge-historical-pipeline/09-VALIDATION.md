---
phase: 9
slug: django-bridge-historical-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x + pytest-django 4.x |
| **Config file** | `django_backend/pytest.ini` |
| **Quick run command** | `cd django_backend && python -m pytest sensor_data/tests/ -x -q` |
| **Full suite command** | `cd django_backend && python -m pytest sensor_data/tests/ -v` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd django_backend && python -m pytest sensor_data/tests/ -x -q`
- **After every plan wave:** Run `cd django_backend && python -m pytest sensor_data/tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 0 | PIPE-01, PIPE-02, PIPE-03 | unit (stubs) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_bridge.py -x -q` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | PIPE-01 | unit (mock) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_bridge.py -x -q` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | PIPE-02 | unit (mock) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_bridge.py -x -q` | ❌ W0 | ⬜ pending |
| 09-01-04 | 01 | 1 | PIPE-03 | integration (DB) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_bridge.py::test_enriched_rows_queryable -x` | ❌ W0 | ⬜ pending |
| 09-01-05 | 01 | 1 | PIPE-04 | unit (existing) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_ingest.py::test_device_addr_is_zone_id -x` | ✅ | ⬜ pending |
| 09-02-01 | 02 | 0 | PIPE-05 | unit (stubs) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_import_log.py -x -q` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 1 | PIPE-05 | unit (mock + DB) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_import_log.py -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `django_backend/sensor_data/tests/test_biosim_bridge.py` — stubs for PIPE-01, PIPE-02, PIPE-03
- [ ] `django_backend/sensor_data/tests/test_biosim_import_log.py` — stubs for PIPE-05

*PIPE-04 covered by existing `test_biosim_ingest.py::test_device_addr_is_zone_id` — no gap.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bridge Docker service starts after BioSim healthy | PIPE-01 (SC#4) | Docker Compose `depends_on` health ordering requires live Docker environment | `docker compose up bridge` and verify logs show successful BioSim connection after healthcheck passes |
| `/trends` page renders BioSim physics data | PIPE-04 (SC#3) | Visual browser verification of chart rendering | Run bridge for 60s, open `/trends`, confirm graphs show non-random data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
