---
phase: 4
slug: anomaly-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — manual + TypeScript compilation |
| **Config file** | none |
| **Quick run command** | `cd spatialhub-frontend && npm run build` |
| **Full suite command** | `cd spatialhub-frontend && npm run build && npm run lint` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spatialhub-frontend && npm run build`
- **After every plan wave:** Run `cd spatialhub-frontend && npm run build && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green + manual browser walkthrough
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ANOM-01 | manual | Visual: 4 scenario buttons in AnomalyDrawer | N/A | ⬜ pending |
| TBD | TBD | TBD | ANOM-01 | manual | DevTools: `window.__habitatStore.getState().anomalies` | N/A | ⬜ pending |
| TBD | TBD | TBD | ANOM-02 | manual | Visual: zone dome pulses red, sparklines spike | N/A | ⬜ pending |
| TBD | TBD | TBD | ANOM-02 | manual | Visual: scenario announcement banner on trigger | N/A | ⬜ pending |
| TBD | TBD | TBD | ANOM-03 | manual | DevTools: biasFactor lerps 0→1 over onset ticks | N/A | ⬜ pending |
| TBD | TBD | TBD | ANOM-03 | manual | Visual: sensors recover to green within ~10s | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework installation needed — project uses manual validation + TypeScript compilation as the established pattern.

- [x] `window.__habitatStore` dev exposure already in habitatStore.ts for console-based anomaly state verification

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AnomalyDrawer renders 4 scenario buttons | ANOM-01 | UI component — no test framework | Open /habitat, click drawer toggle, verify 4 buttons visible |
| CO2 spike causes zone dome to pulse red | ANOM-02 | Visual 3D effect requires browser | Trigger CO2 spike, observe Grow Bays dome |
| Scenario announcement banner appears | ANOM-02 | DOM overlay timing | Trigger any scenario, verify banner at top of screen |
| biasFactor gradual onset (0→1 over ~10s) | ANOM-03 | State transition timing | Open DevTools, trigger scenario, check `anomalies['co2-spike'].biasFactor` each tick |
| Recovery brings sensors back to nominal | ANOM-03 | Visual + state verification | Cancel scenario or wait for timeout, verify dome returns to accent color |
| Concurrent scenarios work independently | ANOM-01 | Multi-scenario interaction | Trigger CO2 spike + power flux simultaneously, verify independent timers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
