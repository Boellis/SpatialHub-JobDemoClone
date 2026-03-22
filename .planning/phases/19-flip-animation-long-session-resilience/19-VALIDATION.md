---
phase: 19
slug: flip-animation-long-session-resilience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.0 + @testing-library/react ^16.3.2 |
| **Config file** | `spatialhub-frontend/vitest.config.ts` |
| **Quick run command** | `cd spatialhub-frontend && npx vitest run` |
| **Full suite command** | `cd spatialhub-frontend && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spatialhub-frontend && npx vitest run`
- **After every plan wave:** Run `cd spatialhub-frontend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | LAYOUT-04 | unit | `npx vitest run src/__tests__/PriorityGrid.test.tsx` | ✅ (update) | ⬜ pending |
| 19-01-02 | 01 | 1 | LAYOUT-04 | unit | `npx vitest run src/__tests__/ZoneCard.test.tsx` | ✅ (update) | ⬜ pending |
| 19-02-01 | 02 | 2 | LAYOUT-04 | unit | `npx vitest run src/__tests__/useSimSource.test.ts` | ✅ (update) | ⬜ pending |
| 19-02-02 | 02 | 2 | GPU health | manual | N/A — production build check | N/A | ⬜ pending |
| 19-03-01 | 03 | 3 | LAYOUT-04 | visual | human checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/PriorityGrid.test.tsx` — update to verify motion.div wrappers have `layoutId="zone-{id}"` (requires motion mock)
- [ ] `src/__tests__/ZoneCard.test.tsx` — update to verify motion children render without crash (requires motion mock)
- [ ] `src/__tests__/useSimSource.test.ts` — add visibilitychange handler tests

*motion mock pattern for tests: vi.mock('motion/react') with div/span forwarding layoutId/layout as data attributes.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FLIP animation slides cards smoothly | LAYOUT-04 | CSS animation in real browser | Trigger zone reorder, verify cards slide to new positions over 500ms |
| Card content not distorted during animation | LAYOUT-04 | Visual rendering | Watch text/sparklines during transition, verify no scaling artifacts |
| GPU memory flat after 10 min | Success criteria 3 | DevTools Performance Monitor | Open Chrome DevTools > Performance Monitor, watch `GPU memory` for 10 min in production build |
| Tab backgrounding recovery | Success criteria 4 | Browser tab interaction | Background tab for 30s, re-foreground, verify data updates resume |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
