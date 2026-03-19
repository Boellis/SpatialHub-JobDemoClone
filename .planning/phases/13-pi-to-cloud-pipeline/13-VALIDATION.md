---
phase: 13
slug: pi-to-cloud-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (hubcode), Vitest (frontend) |
| **Config file** | none — run directly |
| **Quick run command** | `cd hubcode && python -m unittest discover tests/` |
| **Full suite command** | `cd hubcode && python -m unittest discover tests/ && cd ../spatialhub-frontend && npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd hubcode && python -m unittest discover tests/`
- **After every plan wave:** Run full suite (hubcode + frontend)
- **Before `/gsd:verify-work`:** Full suite must be green + manual Pi hardware smoke test
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | DEPLOY-05 | unit | `cd hubcode && python -m unittest discover tests/` | ✅ existing | ⬜ pending |
| 13-01-02 | 01 | 1 | DEPLOY-05 | unit | `cd spatialhub-frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | DEPLOY-05 | manual/smoke | `python hub_client.py --test` on Pi | ❌ manual | ⬜ pending |
| 13-01-04 | 01 | 1 | DEPLOY-05 | manual/curl | `curl .../api/enriched/?hub_id=pi-habitat-01` | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spatialhub-frontend/src/__tests__/useLiveSensors.test.ts` — verify PI_HUB_ID constant value after fix

*Existing hubcode test suite (14 tests) covers all buffer, payload, and sync logic.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pi posts pH to Cloud Run over WiFi | DEPLOY-05 | Requires physical Pi + Atlas sensor hardware | Start `python hub_client.py --test` on Pi, verify "synced" output |
| Offline buffer retains + syncs | DEPLOY-05 | Requires WiFi toggle on Pi hardware | Start hub_client, kill WiFi, observe "buffered", restore WiFi, observe "synced (+ N buffered)" |
| LIVE badge visible on /habitat | DEPLOY-05 | Requires browser check after Firebase redeploy | Visit https://nasa-comp-demo.web.app/habitat, check LIVE badge in Water Recycling zone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
