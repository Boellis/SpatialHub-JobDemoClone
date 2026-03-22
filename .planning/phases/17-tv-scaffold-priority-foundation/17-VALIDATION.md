---
phase: 17
slug: tv-scaffold-priority-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `spatialhub-frontend/vitest.config.ts` |
| **Quick run command** | `cd spatialhub-frontend && npx vitest run src/__tests__/usePriorityRanking.test.ts` |
| **Full suite command** | `cd spatialhub-frontend && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spatialhub-frontend && npx vitest run src/__tests__/usePriorityRanking.test.ts`
- **After every plan wave:** Run `cd spatialhub-frontend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | LAYOUT-01 | unit (smoke) | `npx vitest run src/__tests__/TvDashboardView.test.tsx` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | LAYOUT-01 | unit | included in TvDashboardView test | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | LAYOUT-03 | unit | `npx vitest run src/__tests__/usePriorityRanking.test.ts` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | LAYOUT-03 | unit | included in usePriorityRanking test | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 1 | LAYOUT-03 | unit | included in usePriorityRanking test | ❌ W0 | ⬜ pending |
| 17-02-04 | 02 | 1 | LAYOUT-03 | unit | included in usePriorityRanking test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spatialhub-frontend/src/__tests__/usePriorityRanking.test.ts` — stubs for LAYOUT-03 scoring formula and stability debounce
- [ ] `spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx` — stubs for LAYOUT-01 non-interactive scaffold (jsdom env, no event handlers, Canvas rendered)

*Existing infrastructure (`vitest.config.ts`, `@testing-library/react`, `jsdom`) is already in place. Individual test files needing jsdom must use `/** @vitest-environment jsdom */` directive.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| R3F Canvas shows no raycaster activity in Three.js renderer stats | LAYOUT-01 | Three.js renderer stats require browser devtools inspection | Open `/tv`, enable Three.js devtools, verify 0 raycaster calls per frame |
| Priority order stable in browser with simulated near-threshold sensors | LAYOUT-03 | Full integration with live tick cycle needs browser observation | Open devtools console, call `window.__debugPriority()`, flip sensor near threshold, verify order holds for 3 ticks |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
