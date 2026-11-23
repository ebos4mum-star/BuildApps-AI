const COLORS = ["#19d3a2", "#ffc84a", "#ff6b7a", "#4cc9f0", "#9b7bff"];
/** Decorative; hidden from assistive tech and disabled by prefers-reduced-motion in CSS. */
export function Confetti({ count = 36 }: { count?: number }) {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 97) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${2.2 + (i % 7) * 0.35}s`,
            animationDelay: `${(i % 9) * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
