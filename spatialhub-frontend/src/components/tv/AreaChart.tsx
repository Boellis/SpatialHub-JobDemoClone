// AreaChart — SVG area chart for the hero card's primary sensor history.
// Renders a gradient-filled area with a status-reactive stroke line.
// Uses CSS transitions on path/polyline `d` attribute recalculation for smooth append animation.

import { memo, useId, useMemo } from 'react';

interface AreaChartProps {
  data: number[];      // sensor.history (up to 60 points)
  color: string;       // STATUS_COLORS[sensor.status] — line color
  width?: number;      // viewBox width (default 400, scales via width="100%")
  height?: number | string;     // viewBox height (default 160) or "100%" for flex fill
}

const AreaChartComponent = ({ data, color, width = 400, height = 160 }: AreaChartProps) => {
  const viewBoxHeight = typeof height === 'string' ? 160 : height;
  const uid = useId();
  const gradId = `area-grad-${uid.replace(/:/g, '')}`;

  // Precompute the area + polyline path strings only when the data or dims change,
  // so the 2s sim tick doesn't force a full O(n) remap on unrelated re-renders.
  // Returns null when there isn't enough data to draw (flat-line fallback below).
  const paths = useMemo(() => {
    if (data.length < 2) return null;

    const padding = 4; // px padding so line doesn't clip edges
    const rawMin = Math.min(...data);
    const rawMax = Math.max(...data);
    const rawRange = rawMax - rawMin;
    // Minimum visual range: at least 5% of the midpoint value, so small fluctuations
    // (e.g., pH 7.49-7.51) are visually amplified instead of rendering as a flat line
    const midpoint = (rawMax + rawMin) / 2 || 1;
    const minRange = Math.abs(midpoint) * 0.05;
    const range = Math.max(rawRange, minRange);
    const min = midpoint - range / 2;

    // Map each data point to (x, y) coordinates within the viewBox
    const coords = data.map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = viewBoxHeight - padding - ((value - min) / range) * (viewBoxHeight - padding * 2);
      return { x, y };
    });

    // Polyline points string for the stroke line
    const polylinePoints = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

    // Area path: start at bottom-left, trace points, close at bottom-right
    const firstX = coords[0].x.toFixed(1);
    const lastX = coords[coords.length - 1].x.toFixed(1);
    const areaPath = [
      `M${firstX},${viewBoxHeight}`,
      ...coords.map(({ x, y }) => `L${x.toFixed(1)},${y.toFixed(1)}`),
      `L${lastX},${viewBoxHeight}`,
      'Z',
    ].join(' ');

    return { polylinePoints, areaPath };
  }, [data, width, viewBoxHeight]);

  // Flat line fallback: not enough data to draw a meaningful chart
  if (!paths) {
    const midY = viewBoxHeight / 2;
    return (
      <svg
        viewBox={`0 0 ${width} ${viewBoxHeight}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Gradient fill area below the flat line */}
        <path
          d={`M0,${midY} L${width},${midY} L${width},${viewBoxHeight} L0,${viewBoxHeight} Z`}
          fill={`url(#${gradId})`}
          style={{ transition: 'all 0.4s ease-out' }}
        />
        {/* Flat neutral line */}
        <line
          x1={0}
          y1={midY}
          x2={width}
          y2={midY}
          stroke={color}
          strokeWidth="2"
          strokeOpacity="0.3"
          style={{ transition: 'all 0.4s ease-out' }}
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${viewBoxHeight}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Gradient fill — area below the data line */}
      <path
        d={paths.areaPath}
        fill={`url(#${gradId})`}
        style={{ transition: 'all 0.4s ease-out' }}
      />

      {/* Stroke line — the actual data trace */}
      <polyline
        points={paths.polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'all 0.4s ease-out' }}
      />
    </svg>
  );
};

export const AreaChart = memo(AreaChartComponent);
