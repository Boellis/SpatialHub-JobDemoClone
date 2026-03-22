/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ZoneState, ZoneStatus, SimSource, SensorReading } from '../types/habitat';

// Configurable mock state
let mockZones: Record<string, ZoneState> = {};
let mockSolElapsed = 0;
let mockSimSource: SimSource = 'biosim';

vi.mock('../store/habitatStore', () => ({
  useHabitatStore: (selector: (s: any) => unknown) =>
    selector({ zones: mockZones, solElapsed: mockSolElapsed, simSource: mockSimSource }),
  selectSimSource: (s: any) => s.simSource,
}));

import { StatusBar } from '../components/tv/StatusBar';

// Build a ZoneState with the given status (3 sensors all set to that status)
function makeZone(zoneId: string, status: ZoneStatus): ZoneState {
  const sensors: Record<string, SensorReading> = {};
  for (let i = 0; i < 3; i++) {
    const sid = `${zoneId}-s${i}`;
    sensors[sid] = { sensorId: sid, zoneId, value: 0, status, timestamp: 0, history: [] };
  }
  return { zoneId, status, sensors };
}

// Build all 4 zones with overrides for specific zones
function makeZones(overrides: Record<string, ZoneStatus> = {}): Record<string, ZoneState> {
  const ids = ['grow-bays', 'atmosphere-control', 'water-recycling', 'power-thermal'];
  const zones: Record<string, ZoneState> = {};
  for (const id of ids) {
    zones[id] = makeZone(id, overrides[id] ?? 'green');
  }
  return zones;
}

describe('StatusBar', () => {
  beforeEach(() => {
    mockZones = makeZones();
    mockSolElapsed = 0;
    mockSimSource = 'biosim';
  });

  // Test 1: All green -> ALL SYSTEMS NOMINAL
  it('renders "ALL SYSTEMS NOMINAL" when all 4 zones are green', () => {
    mockZones = makeZones();
    render(<StatusBar />);
    expect(screen.getByTestId('status-message')).toHaveTextContent('ALL SYSTEMS NOMINAL');
  });

  // Test 2: water-recycling red -> WATER RECYCLING: CRITICAL
  it('renders "WATER RECYCLING: CRITICAL" when water-recycling zone is red and others are green', () => {
    mockZones = makeZones({ 'water-recycling': 'red' });
    render(<StatusBar />);
    expect(screen.getByTestId('status-message')).toHaveTextContent('WATER RECYCLING: CRITICAL');
  });

  // Test 3: atmosphere-control yellow -> ATMOSPHERE CONTROL: CAUTION
  it('renders "ATMOSPHERE CONTROL: CAUTION" when atmosphere-control is yellow and others are green', () => {
    mockZones = makeZones({ 'atmosphere-control': 'yellow' });
    render(<StatusBar />);
    expect(screen.getByTestId('status-message')).toHaveTextContent('ATMOSPHERE CONTROL: CAUTION');
  });

  // Test 4: red beats yellow — shows red zone + CRITICAL
  it('shows worst zone CRITICAL when one zone is red and another is yellow', () => {
    mockZones = makeZones({ 'power-thermal': 'red', 'grow-bays': 'yellow' });
    render(<StatusBar />);
    expect(screen.getByTestId('status-message')).toHaveTextContent('POWER & THERMAL: CRITICAL');
  });

  // Test 5: SOL counter with non-zero elapsed
  it('shows "SOL 003" when solElapsed = 2100', () => {
    mockSolElapsed = 2100; // 2100 / 600 = 3.5 -> floor = 3
    render(<StatusBar />);
    expect(screen.getByTestId('sol-counter')).toHaveTextContent('SOL 003');
  });

  // Test 6: SOL counter at zero
  it('shows "SOL 000" when solElapsed = 0', () => {
    mockSolElapsed = 0;
    render(<StatusBar />);
    expect(screen.getByTestId('sol-counter')).toHaveTextContent('SOL 000');
  });

  // Test 7: Connection badge biosim
  it('shows "BioSim Live" when simSource is biosim', () => {
    mockSimSource = 'biosim';
    render(<StatusBar />);
    expect(screen.getByTestId('connection-label')).toHaveTextContent('BioSim Live');
  });

  // Test 8: Connection badge fallback
  it('shows "Fallback Mode" when simSource is fallback', () => {
    mockSimSource = 'fallback';
    render(<StatusBar />);
    expect(screen.getByTestId('connection-label')).toHaveTextContent('Fallback Mode');
  });

  // Test 9: Status dot is green when all nominal
  it('status dot color is #00ff88 when all zones nominal', () => {
    mockZones = makeZones();
    render(<StatusBar />);
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveStyle({ background: '#00ff88' });
  });

  // Test 10: Status dot is red when worst zone is red
  it('status dot color is #ff2200 when worst zone is red', () => {
    mockZones = makeZones({ 'grow-bays': 'red' });
    render(<StatusBar />);
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveStyle({ background: '#ff2200' });
  });

  // Test 11: No event handler attributes in rendered HTML
  it('has no event handler attributes in rendered HTML', () => {
    render(<StatusBar />);
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmousedown');
    expect(html).not.toContain('onpointerdown');
    expect(html).not.toContain('ontouchstart');
    expect(html).not.toContain('onkeydown');
  });
});
