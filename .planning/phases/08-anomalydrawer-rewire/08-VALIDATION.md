---
phase: 8
slug: anomalydrawer-rewire
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `spatialhub-frontend/vitest.config.ts` |
| **Quick run command** | `cd spatialhub-frontend && npm test` |
| **Full suite command** | `cd spatialhub-frontend && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spatialhub-frontend && npm test`
- **After every plan wave:** Run `cd spatialhub-frontend && npm test` (all tests green)
- **Before `/gsd:verify-work`:** Full suite must be green + manual Docker smoke test
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 0 | ANOM-01 | unit | `npm test -- biosimMalfunctions` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 0 | ANOM-02 | unit | `npm test -- biosimMalfunctions` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 0 | ANOM-03 | unit | `npm test -- biosimMalfunctions` | ❌ W0 | ⬜ pending |
| 08-01-04 | 01 | 0 | ANOM-04 | unit | `npm test -- habitatStore.anomalies` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/simulation/biosimMalfunctions.ts` — scenario-to-module map + fetch wrappers (must exist before store extension)
- [ ] `src/__tests__/biosimMalfunctions.test.ts` — covers ANOM-01, ANOM-02, ANOM-03 (environment: jsdom for fetch mock)
- [ ] `src/__tests__/habitatStore.anomalies.test.ts` — covers ANOM-04 fallback path preservation

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BioSim malfunction causes expected sensor cascade | ANOM-01 | Requires live BioSim Docker container | `docker compose up`, POST malfunction to `Nuclear_Source`/`VCCR`, observe WS stream for sensor changes |
| Cancel malfunction stops cascade | ANOM-02 | Requires live BioSim Docker container | POST malfunction, then DELETE with malfunctionID, verify sensors stabilize |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
