---
phase: 6
slug: data-mapping-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (TypeScript)** | vitest ^3.x — not yet installed |
| **Framework (Python)** | pytest ^7 + pytest-django — not yet installed |
| **Config file (TS)** | `spatialhub-frontend/vitest.config.ts` — Wave 0 creates this |
| **Config file (Python)** | `django_backend/pytest.ini` — Wave 0 creates this |
| **Quick run command (TS)** | `cd spatialhub-frontend && npx vitest run src/__tests__/biosimMapper.test.ts` |
| **Full suite command (TS)** | `cd spatialhub-frontend && npx vitest run` |
| **Quick run command (Py)** | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_ingest.py -x -q` |
| **Full suite command (Py)** | `cd django_backend && python -m pytest -x -q` |
| **Estimated runtime** | ~5 seconds (unit tests only, no DB) |

---

## Sampling Rate

- **After every task commit:** Run relevant quick command (TS or Py depending on plan)
- **After every plan wave:** Run both full suite commands
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | TELE-02 | infra | `cd spatialhub-frontend && npm install --save-dev vitest @vitest/coverage-v8` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | TELE-02 | unit | `cd spatialhub-frontend && npx vitest run src/__tests__/biosimMapper.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | TELE-02 | unit | same | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | PERF-03 | unit | same | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 0 | PERF-04 | infra | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_ingest.py -x -q` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | PERF-04 | unit | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_ingest.py -x -q` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | PERF-04 | unit | same | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install vitest: `cd spatialhub-frontend && npm install --save-dev vitest @vitest/coverage-v8`
- [ ] `spatialhub-frontend/vitest.config.ts` — vitest config with `resolveJsonModule` and test glob
- [ ] `spatialhub-frontend/src/__tests__/biosimMapper.test.ts` — test stubs for TELE-02, PERF-03
- [ ] Install pytest: add `pytest>=7.0` and `pytest-django>=4.0` to `django_backend/requirements.txt`
- [ ] `django_backend/pytest.ini` — with `DJANGO_SETTINGS_MODULE = spatialhub_backend.settings`
- [ ] `django_backend/sensor_data/tests/test_biosim_ingest.py` — test stubs for PERF-04
- [ ] `django_backend/sensor_data/tests/__init__.py` — empty package init

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
