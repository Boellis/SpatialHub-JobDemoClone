---
phase: 14
slug: closed-loop-control-service
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-django 4.12.0 |
| **Config file** | `django_backend/pytest.ini` |
| **Quick run command** | `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/test_control_loop.py -x` |
| **Full suite command** | `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/ -x` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/test_control_loop.py -x`
- **After every plan wave:** Run `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | CTRL-01 | unit | `pytest sensor_data/tests/test_control_loop.py::test_get_latest_pi_ph -x` | Wave 0 | pending |
| 14-01-02 | 01 | 1 | CTRL-01 | unit | `pytest sensor_data/tests/test_control_loop.py::test_get_latest_biosim_ph -x` | Wave 0 | pending |
| 14-01-03 | 01 | 1 | CTRL-01 | unit | `pytest sensor_data/tests/test_control_loop.py::test_is_stale_when_old -x` | Wave 0 | pending |
| 14-01-04 | 01 | 1 | CTRL-01 | unit | `pytest sensor_data/tests/test_control_loop.py::test_is_fresh_when_recent -x` | Wave 0 | pending |
| 14-01-05 | 01 | 1 | CTRL-02 | unit | `pytest sensor_data/tests/test_control_loop.py::test_malfunction_triggered_at_threshold -x` | Wave 0 | pending |
| 14-01-06 | 01 | 1 | CTRL-02 | unit | `pytest sensor_data/tests/test_control_loop.py::test_no_duplicate_malfunction -x` | Wave 0 | pending |
| 14-01-07 | 01 | 1 | CTRL-02 | unit | `pytest sensor_data/tests/test_control_loop.py::test_no_malfunction_on_stale_data -x` | Wave 0 | pending |
| 14-01-08 | 01 | 1 | CTRL-03 | unit | `pytest sensor_data/tests/test_control_loop.py::test_malfunction_cleared_below_recovery -x` | Wave 0 | pending |
| 14-01-09 | 01 | 1 | CTRL-03 | unit | `pytest sensor_data/tests/test_control_loop.py::test_malfunction_held_when_stale -x` | Wave 0 | pending |
| 14-01-10 | 01 | 1 | CTRL-03 | unit | `pytest sensor_data/tests/test_control_loop.py::test_hysteresis_no_clear_in_deadband -x` | Wave 0 | pending |
| 14-01-11 | 01 | 1 | CTRL-04 | unit | `pytest sensor_data/tests/test_control_loop.py::test_command_importable -x` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `sensor_data/tests/test_control_loop.py` — all CTRL-XX tests listed above (file does not yet exist)

*Existing test infrastructure (pytest + pytest-django) is already in place.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end causal chain (Pi pH drift -> zone turns red in 3D habitat) | CTRL-01, CTRL-02 | Requires live BioSim + Pi + Firebase frontend | 1. Start control_loop on VM 2. Dip pH sensor in vinegar 3. Watch Water Recycling zone turn red within ~10s |
| Auto-recovery when pH normalizes | CTRL-03 | Requires live BioSim simulation responding to malfunction DELETE | 1. After zone turns red, rinse sensor in water 2. Watch zone recover automatically |
| Service runs as managed process on GCE VM | CTRL-04 | Requires deployed VM with docker-compose | 1. SSH to VM 2. `docker compose -f docker-compose.vm.yml ps` shows control_loop running |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
