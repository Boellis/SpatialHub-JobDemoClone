// Inline SVG sparkline chart — renders the last N sensor readings as a polyline.
// Used inside ZonePanel sensor rows to give a visual history at a glance.

interface SparklineProps {
  data: number[];    // history array (up to 30 points)
  color: string;     // line color (status-reactive: green/yellow/red hex)
  width?: number;    // default 80
  height?: number;   // default 24
}

export const Sparkline = ({ data, color, width = 80, height = 24 }: SparklineProps) => {
  if (data.length < 2) {
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

  const padding = 2; // px padding so line doesn't clip edges
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid division by zero if all values are equal

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    // Map value to y: min -> (height - padding), max -> padding
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

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
