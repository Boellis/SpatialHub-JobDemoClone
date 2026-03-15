---
phase: 5
slug: docker-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
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
| **Full suite command** | `docker compose up -d && docker compose ps && cd django_backend && python manage.py test sensor_data` |
| **Estimated runtime** | ~30 seconds (Django tests) + ~120 seconds (compose startup) |

---

## Sampling Rate

- **After every task commit:** Run `cd django_backend && python manage.py test sensor_data`
- **After every plan wave:** Run `docker compose up -d && docker compose ps`
- **Before `/gsd:verify-work`:** Full suite must be green — all four services healthy/running
- **Max feedback latency:** 30 seconds (Django tests), 120 seconds (compose smoke)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | INFRA-01 | smoke | `docker compose up -d && docker compose ps \| grep -c "(healthy\|running)"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | INFRA-02 | smoke | `curl -s http://localhost:8009/api/simulation \| python3 -m json.tool` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | INFRA-03 | integration | Verified by `docker compose up` logs — healthcheck ordering | n/a | ⬜ pending |
| 05-01-04 | 01 | 1 | INFRA-04 | integration | `docker compose run django python manage.py check --database default` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | OBS-01 | manual | Visit `http://localhost:5173`, verify nav link visible | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/smoke_test.sh` — bash smoke test covering INFRA-01, INFRA-02, INFRA-04
- [ ] `docker/django-entrypoint.sh` — prerequisite for django service
- [ ] `.env.example` — prerequisite for any `docker compose up`
- [ ] `biosim/default.biosim` — needed if config/ not bundled in BioSim image

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Open MCT link visible in nav | OBS-01 | Visual UI check — link styling and positioning | 1. Run `npm run dev` 2. Navigate to `localhost:5173` 3. Verify "Open MCT" link in nav bar 4. Click link → opens `localhost:9091` in new tab |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
