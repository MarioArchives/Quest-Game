export function formatDelta(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return '0';
}

/** Positive = ink chip, negative = red chip. */
export function PointsChip({ points }: { points: number }) {
  return (
    <span className={`chip${points < 0 ? ' chip--neg' : ''}`}>
      {formatDelta(points)}
      <span className="visually-hidden"> points</span>
    </span>
  );
}
