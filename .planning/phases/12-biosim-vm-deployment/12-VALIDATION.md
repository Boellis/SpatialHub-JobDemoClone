---
phase: 12
slug: biosim-vm-deployment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.x (frontend), Django test runner (backend) |
| **Config file** | `spatialhub-frontend/vitest.config.ts`, `django_backend/manage.py test` |
| **Quick run command** | `cd spatialhub-frontend && npx vitest run` |
| **Full suite command** | `cd spatialhub-frontend && npx vitest run && cd ../django_backend && python manage.py test sensor_data` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spatialhub-frontend && npx vitest run`
- **After every plan wave:** Run full suite (frontend + backend)
- **Before `/gsd:verify-work`:** Full suite must be green + all smoke checks pass
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | DEPLOY-03 | unit | `cd spatialhub-frontend && npx vitest run --reporter=verbose src/__tests__/App.test.tsx` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | DEPLOY-03 | smoke | manual verify docker-compose.vm.yml contents | N/A | ⬜ pending |
| 12-02-01 | 02 | 2 | DEPLOY-03 | smoke | `curl -sf http://${VM_IP}:8009/api/simulation` | ❌ deploy.sh | ⬜ pending |
| 12-02-02 | 02 | 2 | DEPLOY-03 | smoke | `curl -sf http://${VM_IP}:9091` | ❌ deploy.sh | ⬜ pending |
| 12-02-03 | 02 | 2 | DEPLOY-03 | smoke | `curl ${CLOUD_RUN_URL}/api/enriched/?hub_id=biosim-habitat-01` | ❌ deploy.sh | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spatialhub-frontend/src/__tests__/App.test.tsx` — covers VITE_OPENMCT_URL env var wiring in App.tsx nav link

*Existing test infrastructure covers all other behaviors. Django tests cover biosim_bridge write path. Frontend tests cover useSimSource, biosimMalfunctions. Only new code — App.tsx Open MCT URL parameterization — needs a new test.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BioSim accessible at VM_IP:8009 | DEPLOY-03 | Requires live GCE VM | Run deploy.sh, then `curl -sf http://{VM_IP}:8009/api/simulation` |
| Open MCT accessible at VM_IP:9091 | DEPLOY-03 | Requires live GCE VM | Run deploy.sh, then `curl -sf http://{VM_IP}:9091` |
| Bridge writes to Cloud SQL | DEPLOY-03 | Requires live BioSim + Cloud SQL | After deploy, `curl {CLOUD_RUN_URL}/api/enriched/?hub_id=biosim-habitat-01` |
| Firebase frontend connects to VM WebSocket | DEPLOY-03 | Requires live BioSim + deployed frontend | Open Firebase URL, verify 3D habitat shows BioSim data |
| AnomalyDrawer POST/DELETE to VM BioSim | DEPLOY-03 | Requires live BioSim + deployed frontend | Open Firebase URL, trigger malfunction in AnomalyDrawer |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
