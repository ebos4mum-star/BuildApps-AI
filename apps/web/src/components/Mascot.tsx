/** "Bolt" - original BuildApps mascot: a friendly building-block robot with a spark antenna. */
export function Mascot({ size = 64, mood = "happy" }: { size?: number; mood?: "happy" | "cheer" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Bolt the builder bot"
      className="mascot"
    >
      <path d="M32 3 L28 12 H33 L30 20 L38 9 H33 L36 3 Z" fill="#ffc84a" />
      <rect x="10" y="20" width="44" height="34" rx="12" fill="#19d3a2" />
      <rect x="10" y="44" width="44" height="10" rx="5" fill="#0e9f78" />
      <rect x="16" y="26" width="32" height="20" rx="8" fill="#130f2a" />
      <circle cx="25" cy="35" r="4.2" fill="#f7f5ff" />
      <circle cx="39" cy="35" r="4.2" fill="#f7f5ff" />
      <circle cx="26" cy="35.5" r="2" fill="#130f2a" />
      <circle cx="40" cy="35.5" r="2" fill="#130f2a" />
      {mood === "cheer" ? (
        <path
          d="M26 42 Q32 48 38 42"
          stroke="#ffc84a"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M28 42 Q32 45 36 42"
          stroke="#19d3a2"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      )}
      <rect x="4" y="30" width="6" height="12" rx="3" fill="#0e9f78" />
      <rect x="54" y="30" width="6" height="12" rx="3" fill="#0e9f78" />
    </svg>
  );
}
