// AlertBanner — toast stack for threshold-crossing alerts
// Positioned at top-center. Yellow alerts auto-dismiss after 5s.
// Red alerts persist until the sensor recovers to green.
// Deduplication: 10s cooldown per alert key (sensorId-level) to prevent spam.

import { useEffect, useRef, useState } from 'react';
import { useHabitatStore } from '../../store/habitatStore';
import { ZONE_CONFIGS, ZONE_MAP, SENSOR_MAP } from '../../simulation/constants';
import { ZONE_ACCENT_COLORS } from './HabitatStructure';
import type { SensorStatus } from '../../types/habitat';

interface Alert {
  id: string;           // "{sensorId}-{level}" e.g. "gb-co2-yellow"
  zoneId: string;
  zoneName: string;
  sensorId: string;
  sensorName: string;
  value: number;
  unit: string;
  level: 'yellow' | 'red';
  direction: 'HIGH' | 'LOW';
  timestamp: number;
}

// Pulse animation for red alerts — defined as a style tag injected once
const ANIMATION_ID = 'alert-banner-animations';

function ensureAnimationsInjected() {
  if (document.getElementById(ANIMATION_ID)) return;
  const style = document.createElement('style');
  style.id = ANIMATION_ID;
  style.textContent = `
    @keyframes alertSlideDown {
      from { transform: translateY(-20px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    @keyframes alertRedPulse {
      0%, 100% { box-shadow: 0 0 8px rgba(255,34,0,0.3); }
      50%       { box-shadow: 0 0 16px rgba(255,34,0,0.7); }
    }
  `;
  document.head.appendChild(style);
}

// Determine HIGH vs LOW for a sensor value relative to its green range
function getDirection(sensorId: string, value: number): 'HIGH' | 'LOW' {
  const entry = SENSOR_MAP[sensorId];
  if (!entry) return 'HIGH';
  const { green } = entry.sensor.thresholds;
  return value > green.max ? 'HIGH' : 'LOW';
}

// Max alerts visible at any one time
const MAX_VISIBLE_ALERTS = 5;

export const AlertBanner = () => {
  useEffect(() => {
    ensureAnimationsInjected();
  }, []);

  const zones = useHabitatStore((s) => s.zones);
  const tickCount = useHabitatStore((s) => s.tickCount);

  const [alerts, setAlerts] = useState<Alert[]>([]);

  // cooldownRef: alertKey -> timestamp of last fire
  const cooldownRef = useRef<Map<string, number>>(new Map());
  // timeoutRef: alertId -> timeout handle (for yellow auto-dismiss cleanup)
  const timeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // On each tick: scan all zones/sensors for non-green status
  useEffect(() => {
    if (tickCount === 0) return;

    const now = Date.now();
    const newAlerts: Alert[] = [];
    const recoveredSensorIds = new Set<string>();

    for (const zoneConfig of ZONE_CONFIGS) {
      const zoneState = zones[zoneConfig.zoneId];
      if (!zoneState) continue;

      for (const sensorConfig of zoneConfig.sensors) {
        const reading = zoneState.sensors[sensorConfig.sensorId];
        if (!reading) continue;

        const status: SensorStatus = reading.status;

        if (status === 'green') {
          // Track sensors that recovered — we'll remove any active alerts for them
          recoveredSensorIds.add(sensorConfig.sensorId);
          continue;
        }

        const level = status as 'yellow' | 'red';
        const alertKey = `${sensorConfig.sensorId}-${level}`;

        // Deduplication: check cooldown (10s minimum between re-fires of same key)
        const lastFired = cooldownRef.current.get(alertKey);
        if (lastFired !== undefined && now - lastFired < 10_000) {
          continue;
        }

        const zoneInfo = ZONE_MAP[zoneConfig.zoneId];
        newAlerts.push({
          id: alertKey,
          zoneId: zoneConfig.zoneId,
          zoneName: zoneInfo?.name ?? zoneConfig.zoneId,
          sensorId: sensorConfig.sensorId,
          sensorName: sensorConfig.name,
          value: reading.value,
          unit: sensorConfig.unit,
          level,
          direction: getDirection(sensorConfig.sensorId, reading.value),
          timestamp: now,
        });

        cooldownRef.current.set(alertKey, now);
      }
    }

    if (newAlerts.length === 0 && recoveredSensorIds.size === 0) return;

    setAlerts((prev) => {
      let updated = [...prev];

      // Remove alerts for sensors that returned to green
      if (recoveredSensorIds.size > 0) {
        const toRemove = updated.filter((a) => recoveredSensorIds.has(a.sensorId));
        for (const a of toRemove) {
          // Clear any pending auto-dismiss timeout
          const t = timeoutRef.current.get(a.id);
          if (t !== undefined) {
            clearTimeout(t);
            timeoutRef.current.delete(a.id);
          }
        }
        updated = updated.filter((a) => !recoveredSensorIds.has(a.sensorId));
      }

      // Add new alerts, deduplicating by id (replace if same key fires again)
      for (const alert of newAlerts) {
        // Remove existing with same id before prepending (level transition)
        updated = updated.filter((a) => a.id !== alert.id);
        updated = [alert, ...updated];
      }

      // Enforce max 5 visible — drop the oldest (end of array = oldest because newest prepended)
      if (updated.length > MAX_VISIBLE_ALERTS) {
        const removed = updated.slice(MAX_VISIBLE_ALERTS);
        for (const a of removed) {
          const t = timeoutRef.current.get(a.id);
          if (t !== undefined) {
            clearTimeout(t);
            timeoutRef.current.delete(a.id);
          }
        }
        updated = updated.slice(0, MAX_VISIBLE_ALERTS);
      }

      return updated;
    });

    // Schedule auto-dismiss for yellow alerts (outside setAlerts to avoid stale closure)
    for (const alert of newAlerts) {
      if (alert.level === 'yellow') {
        // Clear any existing timeout for this key before scheduling a fresh one
        const existing = timeoutRef.current.get(alert.id);
        if (existing !== undefined) clearTimeout(existing);

        const t = setTimeout(() => {
          setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
          timeoutRef.current.delete(alert.id);
        }, 5_000);

        timeoutRef.current.set(alert.id, t);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickCount]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      for (const t of timeoutRef.current.values()) {
        clearTimeout(t);
      }
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'center',
        zIndex: 20,
        // Container itself must NOT intercept pointer events (it's in the none-overlay)
        pointerEvents: 'none',
      }}
    >
      {alerts.map((alert) => {
        const accentColor = ZONE_ACCENT_COLORS[alert.zoneId] ?? '#ffffff';
        const borderColor = alert.level === 'red' ? '#ff2200' : '#ffaa00';
        const isRed = alert.level === 'red';

        // Format value — integers for co2/power/tds, 1dp for everything else
        const formattedValue = Number.isInteger(alert.value)
          ? String(alert.value)
          : alert.value.toFixed(1);

        return (
          <div
            key={alert.id}
            style={{
              background: 'rgba(10, 12, 18, 0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: '8px',
              padding: '10px 16px',
              borderLeft: `3px solid ${borderColor}`,
              animation: isRed
                ? 'alertSlideDown 300ms ease-out, alertRedPulse 1.8s ease-in-out infinite'
                : 'alertSlideDown 300ms ease-out',
              fontFamily: 'monospace',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: '280px',
              pointerEvents: 'auto',
              // Accent left-bar color hint via box-shadow
              boxShadow: isRed
                ? `0 0 8px rgba(255,34,0,0.3), inset 0 0 0 0 transparent`
                : `0 2px 12px rgba(0,0,0,0.4)`,
            }}
          >
            {/* Warning icon */}
            <span
              style={{
                fontSize: '14px',
                color: borderColor,
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              {isRed ? '!!' : '!'}
            </span>

            {/* Zone accent dot */}
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: accentColor,
                boxShadow: `0 0 4px ${accentColor}`,
                flexShrink: 0,
              }}
            />

            {/* Alert content */}
            <div style={{ fontSize: '12px', letterSpacing: '0.04em' }}>
              <span style={{ color: 'rgba(209,213,219,1)', fontWeight: 600 }}>
                {alert.zoneName}
              </span>
              {' — '}
              <span style={{ color: 'rgba(209,213,219,0.8)' }}>
                {alert.sensorName}
              </span>
              {' '}
              <span style={{ color: borderColor, fontWeight: 700 }}>
                {alert.direction}
              </span>
              {' — '}
              <span style={{ color: 'white' }}>
                {formattedValue} {alert.unit}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
