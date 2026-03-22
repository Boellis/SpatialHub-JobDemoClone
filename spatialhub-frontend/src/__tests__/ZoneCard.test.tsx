/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ZoneState, SensorReading, ZoneStatus } from '../types/habitat';

// Mock Sparkline as a simple div
vi.mock('../components/habitat/Sparkline', () => ({
  Sparkline: (props: { data: number[]; color: string }) => (
    <div data-testid="sparkline" data-color={props.color} />
  ),
}));

// Configurable mock zone state
let mockZone: ZoneState | undefined;

vi.mock('../store/habitatStore', () => ({
  useHabitatStore: (selector: (s: any) => unknown) => {
    return selector({ zones: { 'grow-bays': mockZone } });
  },
  selectZone: (zoneId: string) => (state: any) => state.zones[zoneId],
}));

import { ZoneCard } from '../components/tv/ZoneCard';

function makeZone(status: ZoneStatus, sensorOverrides?: Record<string, Partial<SensorReading>>): ZoneState {
  const sensors: Record<string, SensorReading> = {
    'gb-co2': { sensorId: 'gb-co2', zoneId: 'grow-bays', value: 800, status: 'green', timestamp: 0, history: [790, 795, 800] },
    'gb-temp': { sensorId: 'gb-temp', zoneId: 'grow-bays', value: 22, status: 'green', timestamp: 0, history: [21.5, 21.8, 22] },
    'gb-humidity': { sensorId: 'gb-humidity', zoneId: 'grow-bays', value: 55, status: 'green', timestamp: 0, history: [54, 54.5, 55] },
  };
  if (sensorOverrides) {
    for (const [id, overrides] of Object.entries(sensorOverrides)) {
      if (sensors[id]) Object.assign(sensors[id], overrides);
    }
  }
  return { zoneId: 'grow-bays', status, sensors };
}

describe('ZoneCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: renders zone name uppercased
  it('renders zone name text uppercased', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    expect(screen.getByTestId('zone-name')).toHaveTextContent('GROW BAYS');
  });

  // Test 2: renders all 3 sensor names
  it('renders all 3 sensor names for the zone', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    expect(screen.getByText('CO2 Level')).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Humidity')).toBeInTheDocument();
  });

  // Test 3: renders sensor values
  it('renders sensor values', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    expect(screen.getByTestId('sensor-value-gb-co2')).toHaveTextContent('800');
    expect(screen.getByTestId('sensor-value-gb-temp')).toHaveTextContent('22');
  });

  // Test 4: renders a Sparkline for each sensor (3 total)
  it('renders a Sparkline for each sensor (3 Sparkline elements per card)', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    const sparklines = screen.getAllByTestId('sparkline');
    expect(sparklines).toHaveLength(3);
  });

  // Test 5: hero card uses fontSize 48 for sensor values
  it('hero card (isHero=true) uses fontSize 48 for sensor values', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={true} />);
    const valueEl = screen.getByTestId('sensor-value-gb-co2');
    expect(valueEl).toHaveStyle({ fontSize: '48px' });
  });

  // Test 6: secondary card uses fontSize 28 for sensor values
  it('secondary card (isHero=false) uses fontSize 28 for sensor values', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    const valueEl = screen.getByTestId('sensor-value-gb-co2');
    expect(valueEl).toHaveStyle({ fontSize: '28px' });
  });

  // Test 7: green-status card has near-invisible border and no animation
  it('green-status card has border rgba(255,255,255,0.06) and no animation', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    const card = screen.getByTestId('zone-card-grow-bays');
    const style = card.getAttribute('style') ?? '';
    // Browser normalizes rgba — check for 255, 255 pattern (white border)
    expect(style).toMatch(/rgba\(255,\s*255,\s*255,\s*0\.06\)/);
    expect(style).not.toContain('zoneCriticalPulse');
  });

  // Test 8: yellow-status card has static amber border
  it('yellow-status card has border containing rgba(255,170,0,0.4) and no animation', () => {
    mockZone = makeZone('yellow');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    const card = screen.getByTestId('zone-card-grow-bays');
    const style = card.getAttribute('style') ?? '';
    // Browser normalizes rgba — check for 170 amber pattern
    expect(style).toMatch(/rgba\(255,\s*170,\s*0,\s*0\.4\)/);
    expect(style).not.toContain('zoneCriticalPulse');
  });

  // Test 9: red-status card has animation containing 'zoneCriticalPulse'
  it('red-status card has animation style containing zoneCriticalPulse', () => {
    mockZone = makeZone('red');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    const card = screen.getByTestId('zone-card-grow-bays');
    const style = card.getAttribute('style') ?? '';
    expect(style).toContain('zoneCriticalPulse');
  });

  // Test 10: zone status badge shows 'NOMINAL' for green zone
  it('zone status badge shows NOMINAL for green zone', () => {
    mockZone = makeZone('green');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    expect(screen.getByTestId('zone-status-badge')).toHaveTextContent('NOMINAL');
  });

  // Test 11: zone status badge shows 'CRITICAL' for red zone
  it('zone status badge shows CRITICAL for red zone', () => {
    mockZone = makeZone('red');
    render(<ZoneCard zoneId="grow-bays" isHero={false} />);
    expect(screen.getByTestId('zone-status-badge')).toHaveTextContent('CRITICAL');
  });
});
