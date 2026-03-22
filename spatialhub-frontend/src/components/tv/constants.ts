import type { ZoneStatus, SimSource } from '../../types/habitat';

// Status color map — identical to HabitatHUD.tsx (source of truth for TV components)
export const STATUS_COLORS: Record<ZoneStatus, string> = {
  green: '#00ff88',
  yellow: '#ffaa00',
  red: '#ff2200',
};

// Status label map — uppercase status text for badges and alerts
export const STATUS_LABELS: Record<ZoneStatus, string> = {
  green: 'NOMINAL',
  yellow: 'CAUTION',
  red: 'CRITICAL',
};

// Connection badge config — dot color, label, text color per SimSource state
// Extracted from ConnectionBadge.tsx for StatusBar inline rendering (no pulse animation on TV bar)
export const BADGE_CONFIG: Record<SimSource, { dot: string; label: string; textColor: string }> = {
  connecting:    { dot: '#9ca3af', label: 'Connecting...',        textColor: '#9ca3af' },
  biosim:        { dot: '#00ff88', label: 'BioSim Live',          textColor: '#00ff88' },
  'biosim-real': { dot: '#00ffcc', label: 'BioSim + Real Sensor', textColor: '#00ffcc' },
  disconnected:  { dot: '#ff2200', label: 'Disconnected',         textColor: '#ff2200' },
  fallback:      { dot: '#f59e0b', label: 'Fallback Mode',        textColor: '#f59e0b' },
};
