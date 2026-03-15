---
phase: 5
slug: docker-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-14
updated: 2026-03-14
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Django test runner (unittest) + bash smoke tests |
| **Config file** | No pytest.ini — uses `python manage.py test sensor_data` |
| **Quick run command** | `cd django_backend && python manage.py test sensor_data` |
| **Full suite command** | `docker compose up -d && ./tests/smoke_test.sh` |
| **Estimated runtime** | ~30 seconds (Django tests) + ~120 seconds (compose startup) |

---

## Sampling Rate

- **After every task commit:** Run `cd django_backend && python manage.py test sensor_data`
- **After every plan wave:** Run `docker compose up -d && ./tests/smoke_test.sh`
- **Before `/gsd:verify-work`:** Full suite must be green — all four services healthy/running
- **Max feedback latency:** 30 seconds (Django tests), 120 seconds (compose smoke)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | INFRA-01 | smoke | `docker compose config --quiet && grep -q "biosim.Dockerfile" docker-compose.yml` | inline | ⬜ pending |
| 05-01-02 | 01 | 1 | INFRA-04 | smoke | `grep -q "exec gunicorn" django_backend/docker/django-entrypoint.sh` | inline | ⬜ pending |
| 05-01-03 | 01 | 1 | INFRA-02, INFRA-03 | smoke | `./tests/smoke_test.sh` | ✅ (Task 3 creates it) | ⬜ pending |
| 05-02-01 | 02 | 1 | OBS-01 | manual | Visit `http://localhost:5173`, verify nav link visible | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/smoke_test.sh` — created by Plan 05-01 Task 3
- [x] `django_backend/docker/django-entrypoint.sh` — created by Plan 05-01 Task 2
- [x] `.env.example` — created by Plan 05-01 Task 1
- [x] `tests/fixtures/biosim_module_state.json` — captured by Plan 05-01 Task 3
- [ ] `biosim/default.biosim` — bundled in biosim.Dockerfile build stage (COPY from build)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Open MCT link visible in nav | OBS-01 | Visual UI check — link styling and positioning | 1. Run `npm run dev` 2. Navigate to `localhost:5173` 3. Verify "Open MCT" link in nav bar 4. Click link → opens `localhost:9091` in new tab |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
