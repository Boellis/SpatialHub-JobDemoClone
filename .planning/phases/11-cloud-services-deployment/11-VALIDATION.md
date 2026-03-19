---
phase: 11
slug: cloud-services-deployment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x + pytest-django (Django) / vitest 4.x (frontend) |
| **Config file** | `django_backend/pytest.ini` (Django) / `spatialhub-frontend/vite.config.*` (frontend) |
| **Quick run command** | `cd django_backend && USE_SQLITE=1 pytest sensor_data/tests/test_pi_ingest.py -x -q` |
| **Full suite command** | `cd django_backend && USE_SQLITE=1 pytest -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd django_backend && USE_SQLITE=1 pytest sensor_data/tests/test_pi_ingest.py -x -q`
- **After every plan wave:** Run `cd django_backend && USE_SQLITE=1 pytest -q`
- **Before `/gsd:verify-work`:** Full suite must be green + deploy script smoke checks pass
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | DEPLOY-01 | smoke (curl) | `curl -f "${CLOUD_RUN_URL}/api/enriched/"` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | DEPLOY-02 | smoke (curl) | `curl -f "https://interviewing-457222.web.app"` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | DEPLOY-04 | smoke (curl) | `curl -f "${CLOUD_RUN_URL}/api/habitat/zones/"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Smoke checks embedded at end of `deploy/deploy.sh` — curl-based: DEPLOY-01 (`/api/enriched/`), DEPLOY-02 (Firebase URL), DEPLOY-04 (`/api/habitat/zones/` returns 4 zones)
- [ ] No new unit test files needed — application logic tests already exist; this phase is infra work

*Existing test infrastructure covers all application-level verification; the new gap is cloud infrastructure smoke checks post-deploy.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend pages display data from Cloud Run API | DEPLOY-02 | Visual verification of React rendering from live API | Load Firebase URL, navigate to /raw, /enriched, /trends, /habitat — verify data renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
