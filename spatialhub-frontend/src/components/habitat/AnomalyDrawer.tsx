// AnomalyDrawer — collapsible bottom-center trigger panel for anomaly scenarios
// Three visual parts:
//   (A) Always-visible toggle button at bottom-center
//   (B) Collapsible scenario drawer with 4 buttons (slides up from bottom)
//   (C) Scenario announcement banners at top-center (separate from AlertBanner)
//
// Follows the CSS injection pattern from AlertBanner and the glassmorphism style
// established throughout the HUD/ZonePanel ecosystem.

import { useEffect, useRef, useState } from 'react';
import { useHabitatStore } from '../../store/habitatStore';
import { ANOMALY_SCENARIOS } from '../../simulation/anomalies';
import { ZONE_ACCENT_COLORS } from './HabitatStructure';

const ANIMATION_ID = 'anomaly-drawer-animations';

function ensureAnimationsInjected() {
  if (document.getElementById(ANIMATION_ID)) return;
  const style = document.createElement('style');
  style.id = ANIMATION_ID;
  style.textContent = `
    @keyframes drawerSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);   opacity: 1; }
    }
    @keyframes scenarioBtnPulse {
      0%,  100% { box-shadow: 0 0 6px rgba(255,34,0,0.3); }
      50%       { box-shadow: 0 0 14px rgba(255,34,0,0.7); }
    }
    @keyframes announcementSlideDown {
      from { transform: translateY(-20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

export const AnomalyDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);

  const anomalies = useHabitatStore((s) => s.anomalies);
  const scenarioAnnouncements = useHabitatStore((s) => s.scenarioAnnouncements);
  const triggerAnomaly = useHabitatStore((s) => s.triggerAnomaly);
  const dismissAnnouncement = useHabitatStore((s) => s.dismissAnnouncement);

  // Track auto-dismiss timeouts per announcement timestamp
  const dismissTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    ensureAnimationsInjected();
  }, []);

  // Auto-dismiss announcements after 8 seconds
  useEffect(() => {
    for (const announcement of scenarioAnnouncements) {
      if (!dismissTimers.current.has(announcement.timestamp)) {
        const t = setTimeout(() => {
          dismissAnnouncement(announcement.timestamp);
          dismissTimers.current.delete(announcement.timestamp);
        }, 8_000);
        dismissTimers.current.set(announcement.timestamp, t);
      }
    }
  }, [scenarioAnnouncements, dismissAnnouncement]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      for (const t of dismissTimers.current.values()) {
        clearTimeout(t);
      }
    };
  }, []);

  // Determine if any anomaly is currently active (non-idle)
  const hasActiveAnomaly = Object.values(anomalies).some(
    (a) => a.phase !== 'idle'
  );

  return (
    <>
      {/* (C) Scenario Announcement Banners — top-center, above AlertBanner */}
      <div
        style={{
          position: 'absolute',
          top: '0.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'center',
          zIndex: 25,
          pointerEvents: 'none',
        }}
      >
        {scenarioAnnouncements.map((announcement) => {
          const accentColor =
            ZONE_ACCENT_COLORS[announcement.zoneId] ?? '#ffffff';
          return (
            <div
              key={announcement.timestamp}
              style={{
                background: 'rgba(10, 12, 18, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '8px',
                padding: '11px 18px',
                borderLeft: `4px solid ${accentColor}`,
                animation: 'announcementSlideDown 300ms ease-out',
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'white',
                minWidth: '380px',
                pointerEvents: 'auto',
                boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              WARNING: {announcement.label.toUpperCase()} DETECTED — {announcement.zoneName.toUpperCase()}
            </div>
          );
        })}
      </div>

      {/* (B) Scenario Drawer — slides up, rendered when isOpen */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '4rem',
            left: '50%',
            transform: 'translateX(-50%)',
            animation: 'drawerSlideUp 300ms ease-out',
            background: 'rgba(10, 12, 18, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '12px 16px',
            zIndex: 30,
            pointerEvents: 'auto',
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setIsOpen(false)}
            style={{
              position: 'absolute',
              top: '6px',
              right: '8px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.35)',
              fontFamily: 'monospace',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '2px 6px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>

          {/* Scenario buttons row */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              paddingTop: '8px',
            }}
          >
            {ANOMALY_SCENARIOS.map((scenario) => {
              const scenarioState = anomalies[scenario.id];
              const isActive =
                scenarioState !== undefined && scenarioState.phase !== 'idle';

              return (
                <button
                  key={scenario.id}
                  onClick={() => triggerAnomaly(scenario.id)}
                  style={{
                    background: isActive
                      ? 'rgba(255,34,0,0.15)'
                      : 'transparent',
                    border: isActive
                      ? '1px solid #ff2200'
                      : '1px solid rgba(255,255,255,0.15)',
                    color: isActive ? '#ff2200' : 'rgba(255,255,255,0.5)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    minWidth: '80px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px',
                    animation: isActive
                      ? 'scenarioBtnPulse 1.5s ease-in-out infinite'
                      : 'none',
                    transition: 'border 200ms, background 200ms, color 200ms',
                  }}
                >
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>
                    {scenario.icon}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      letterSpacing: '0.06em',
                      lineHeight: 1.2,
                    }}
                  >
                    {scenario.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* (A) Toggle Button — always visible at bottom-center */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 12, 18, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '8px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          zIndex: 30,
          pointerEvents: 'auto',
        }}
      >
        <span style={{ fontSize: '13px' }}>⚠</span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          SCENARIOS
        </span>
        {/* Active anomaly indicator dot */}
        {hasActiveAnomaly && (
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#ff2200',
              boxShadow: '0 0 6px rgba(255,34,0,0.8)',
              marginLeft: '2px',
            }}
          />
        )}
      </button>
    </>
  );
};
