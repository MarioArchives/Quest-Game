/** The story progress strip: one segment per card, ink for the ones seen so far. */
export function ProgressBars({ count, index }: { count: number; index: number }) {
  return (
    <div
      className="wrap__bars"
      role="progressbar"
      aria-label="Wrap progress"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      aria-valuetext={`Card ${index + 1} of ${count}`}
      data-no-capture
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`wrap__bar${i <= index ? ' is-seen' : ''}`} />
      ))}
    </div>
  );
}
