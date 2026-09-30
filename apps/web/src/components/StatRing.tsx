/** A small circular progress indicator (SVG, no chart library) for fraction/percentage
 * stats — Completeness and Confidence in the stat strip. */
export function StatRing({ fraction, color, size = 56 }: { fraction: number; color: string; size?: number }) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped);
  const center = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
