// Inline SVG sparkline chart — renders the last N sensor readings as a polyline.
// Used inside ZonePanel sensor rows to give a visual history at a glance.

import { memo, useMemo } from 'react';

interface SparklineProps {
  data: number[];    // history array (up to 30 points)
  color: string;     // line color (status-reactive: green/yellow/red hex)
  width?: number;    // default 80
  height?: number;   // default 24
}

const SparklineComponent = ({ data, color, width = 80, height = 24 }: SparklineProps) => {
  // Recompute the polyline points only when the data or dims change, not on every
  // 2s sim tick that re-renders the parent panel.
  const points = useMemo(() => {
    if (data.length < 2) return null;

    const padding = 2; // px padding so line doesn't clip edges
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // avoid division by zero if all values are equal

    return data.map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      // Map value to y: min -> (height - padding), max -> padding
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [data, width, height]);

  if (points === null) {
    // Not enough data yet — render a flat neutral line
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth="1"
          strokeOpacity="0.3"
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const Sparkline = memo(SparklineComponent);
