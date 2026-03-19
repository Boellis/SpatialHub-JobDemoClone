/** @vitest-environment jsdom */
/**
 * App component tests — VITE_OPENMCT_URL env var coverage.
 *
 * Tests verify:
 *  - When VITE_OPENMCT_URL is NOT set, the Open MCT nav link href is the
 *    localhost:9091 fallback.
 *  - When VITE_OPENMCT_URL is set to a custom URL, the Open MCT nav link
 *    href reflects that value.
 *
 * Uses vi.stubEnv to control import.meta.env at vitest runtime.
 * afterEach unstubs all env vars to prevent test bleed.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('App — Open MCT nav link', () => {
  it('uses localhost:9091 as fallback when VITE_OPENMCT_URL is not set', () => {
    vi.stubEnv('VITE_OPENMCT_URL', undefined as unknown as string);
    render(<App />);
    const link = screen.getByRole('link', { name: /open mct/i });
    expect(link).toHaveAttribute('href', 'http://localhost:9091');
  });

  it('uses VITE_OPENMCT_URL when set to a custom value', () => {
    vi.stubEnv('VITE_OPENMCT_URL', 'http://10.0.0.1:9091');
    render(<App />);
    const link = screen.getByRole('link', { name: /open mct/i });
    expect(link).toHaveAttribute('href', 'http://10.0.0.1:9091');
  });
});
