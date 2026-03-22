---
phase: 18
slug: zone-cards-static-grid
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.0 + @testing-library/react ^16.3.2 |
| **Config file** | `spatialhub-frontend/vitest.config.ts` |
| **Quick run command** | `cd spatialhub-frontend && npx vitest run src/__tests__/TvDashboardView.test.tsx` |
| **Full suite command** | `cd spatialhub-frontend && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spatialhub-frontend && npx vitest run src/__tests__/TvDashboardView.test.tsx`
- **After every plan wave:** Run `cd spatialhub-frontend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | DATA-02 | unit | `npx vitest run src/__tests__/biosimMapper.test.ts && npx tsc --noEmit` | ✅ exists | ⬜ pending |
| 18-01-02 | 01 | 1 | DATA-03, DATA-04, STAT-01 | unit | `npx vitest run src/__tests__/StatusBar.test.tsx` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 2 | DATA-01, DATA-02, STAT-02 | unit | `npx vitest run src/__tests__/ZoneCard.test.tsx` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 2 | LAYOUT-02 | unit | `npx vitest run src/__tests__/PriorityGrid.test.tsx` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 3 | ALL | visual | human checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/StatusBar.test.tsx` — stubs for DATA-03, DATA-04, STAT-01
- [ ] `src/__tests__/ZoneCard.test.tsx` — stubs for DATA-01, DATA-02, STAT-02
- [ ] `src/__tests__/PriorityGrid.test.tsx` — stubs for LAYOUT-02
- [ ] `TvDashboardView.test.tsx` — extend mocks for StatusBar + PriorityGrid

*Existing infrastructure covers all Phase 18 needs. Mock pattern for Zustand store already established in `usePriorityRanking.test.ts` and `TvDashboardView.test.tsx`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TV-safe typography readable from 3m | DATA-01 | Visual distance test | Open `/habitat` on 1080p TV or monitor, verify 48px+ values visible from 3m |
| Sparkline chart updates visually | DATA-02 | Visual rendering | Watch sparkline for 30s, verify polyline updates with new data points |
| Red zone pulse animation | STAT-02 | CSS animation | Trigger red status via DevTools store mutation, verify border glow breathes at ~2s cycle |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending