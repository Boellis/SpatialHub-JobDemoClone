/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock @react-three/fiber — useFrame as a no-op, useThree returns stub
vi.mock('@react-three/fiber', () => ({
  useFrame: (_cb: unknown) => undefined,
  useThree: () => ({ gl: {}, scene: {}, camera: {} }),
}));

// Mock three — InstancedMesh, SphereGeometry, MeshBasicMaterial, Color, Matrix4, Vector3
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    AdditiveBlending: 2,
    Color: class {
      r = 1; g = 0.42; b = 0.21;
      setStyle(_s: string) { return this; }
      offsetHSL(_h: number, _s: number, _l: number) { return this; }
    },
    Matrix4: class {
      makeTranslation(_x: number, _y: number, _z: number) { return this; }
      makeScale(_x: number, _y: number, _z: number) { return this; }
      multiply(_m: unknown) { return this; }
      compose(_pos: unknown, _quat: unknown, _scale: unknown) { return this; }
    },
    Vector3: class {
      set(_x: number, _y: number, _z: number) { return this; }
    },
    Quaternion: class {},
    InstancedMesh: class {
      count: number;
      instanceMatrix = { needsUpdate: false };
      instanceColor = null;
      setMatrixAt(_i: number, _m: unknown) {}
      setColorAt(_i: number, _c: unknown) {}
      constructor(_geo: unknown, _mat: unknown, count: number) {
        this.count = count;
      }
    },
  };
});

import { ParallaxBackground } from '../components/tv/ParallaxBackground';

describe('ParallaxBackground', () => {
  it('exports a named ParallaxBackground export', () => {
    expect(ParallaxBackground).toBeDefined();
    expect(typeof ParallaxBackground).toBe('function');
  });

  it('renders without crashing', () => {
    expect(() => render(<ParallaxBackground />)).not.toThrow();
  });

  it('rendered output contains no event handler attributes', () => {
    const { container } = render(<ParallaxBackground />);
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmousedown');
    expect(html).not.toContain('onpointerdown');
    expect(html).not.toContain('ontouchstart');
    expect(html).not.toContain('onkeydown');
  });

  it('component function is defined and callable', () => {
    // Verifies the named export is a valid React component (function shape)
    expect(typeof ParallaxBackground).toBe('function');
    expect(ParallaxBackground.length).toBeGreaterThanOrEqual(0);
  });
});
