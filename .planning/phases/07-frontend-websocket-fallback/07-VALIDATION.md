---
phase: 7
slug: frontend-websocket-fallback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 + @vitest/web-worker |
| **Config file** | `spatialhub-frontend/vitest.config.ts` |
| **Quick run command** | `cd spatialhub-frontend && npm test` |
| **Full suite command** | `cd spatialhub-frontend && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spatialhub-frontend && npm test`
- **After every plan wave:** Run `cd spatialhub-frontend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | TELE-01 | unit | `npm test -- useBioSimWS` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | TELE-03 | unit | `npm test -- useSimSource` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | TELE-04 | unit | `npm test -- biosimWorker` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | FALL-01 | unit | `npm test -- useSimSource` | ❌ W0 | ⬜ pending |
| 07-01-05 | 01 | 1 | FALL-02 | unit | `npm test -- useSimSource` | ❌ W0 | ⬜ pending |
| 07-01-06 | 01 | 1 | FALL-04 | unit | `npm test -- useSimSource` | ❌ W0 | ⬜ pending |
| 07-01-07 | 01 | 1 | PERF-01 | unit | `npm test -- biosimWorker` | ❌ W0 | ⬜ pending |
| 07-01-08 | 01 | 1 | PERF-02 | unit | `npm test -- habitatStore` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | FALL-03 | unit | `npm test -- ConnectionBadge` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | PERF-05 | manual | N/A | n/a | ⬜ pending |
| 07-02-03 | 02 | 2 | PERF-06 | manual | N/A | n/a | ⬜ pending |
| 07-02-04 | 02 | 2 | PERF-07 | manual | N/A | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/useSimSource.test.ts` — stubs for FALL-01, FALL-02, FALL-04, TELE-03
- [ ] `src/__tests__/useBioSimWS.test.ts` — stubs for TELE-01
- [ ] `src/__tests__/biosimWorker.test.ts` — stubs for TELE-04, PERF-01
- [ ] `src/__tests__/ConnectionBadge.test.ts` — stubs for FALL-03
- [ ] `src/__tests__/habitatStore.simSource.test.ts` — stubs for PERF-02
- [ ] Install: `cd spatialhub-frontend && npm install --save-dev @vitest/web-worker`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 60fps during BioSim mode | PERF-05 | Requires Chrome DevTools Performance panel | Record 10s with BioSim active, verify frame budget |
| Sub-100ms WS-to-visual latency | PERF-06 | Requires DevTools Timeline instrumentation | Add performance.mark() around tick(), measure WS receive to paint |
| Burst handling without OOM | PERF-07 | Requires heap snapshot comparison | Take heap snapshot before/after 20-message burst, verify no growth |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
