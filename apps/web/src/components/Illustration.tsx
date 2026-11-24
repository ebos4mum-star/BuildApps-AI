/**
 * Original BuildApps scene illustrations (inline SVG, decorative). Each pairs with visible text, so they are
 * hidden from assistive technology. Built from the same palette as the mascot.
 */
type Scene = "empty-projects" | "all-clear" | "locked" | "inbox-zero" | "celebrate" | "rescue";

const P = {
  bg: "#241e52",
  mint: "#19d3a2",
  mintD: "#0e9f78",
  sun: "#ffc84a",
  coral: "#ff6b7a",
  sky: "#4cc9f0",
  violet: "#9b7bff",
  ink: "#130f2a",
};

export function Illustration({ scene, size = 140 }: { scene: Scene; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className="illustration"
    >
      <circle cx="60" cy="60" r="54" fill={P.bg} />
      {scene === "empty-projects" && (
        <>
          <rect x="30" y="64" width="24" height="24" rx="6" fill={P.mint} />
          <rect x="58" y="64" width="24" height="24" rx="6" fill={P.sky} />
          <rect x="44" y="38" width="24" height="24" rx="6" fill={P.sun} />
          <path d="M84 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill={P.violet} />
        </>
      )}
      {scene === "all-clear" && (
        <>
          <path d="M60 24 L88 34 V60 C88 78 75 90 60 96 C45 90 32 78 32 60 V34Z" fill={P.mint} />
          <path
            d="M46 60 l10 10 20 -22"
            stroke={P.ink}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {scene === "locked" && (
        <>
          <rect x="38" y="54" width="44" height="36" rx="9" fill={P.violet} />
          <path
            d="M46 54 V44 a14 14 0 0 1 28 0 V54"
            stroke={P.sun}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="60" cy="72" r="5" fill={P.ink} />
        </>
      )}
      {scene === "inbox-zero" && (
        <>
          <rect x="28" y="44" width="64" height="40" rx="9" fill={P.sky} />
          <path
            d="M30 48 L60 70 L90 48"
            stroke={P.ink}
            strokeWidth="5"
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="86" cy="40" r="9" fill={P.sun} />
        </>
      )}
      {scene === "celebrate" && (
        <>
          <path d="M60 28 l7 16 17 2 -13 11 4 17 -15 -9 -15 9 4 -17 -13 -11 17 -2z" fill={P.sun} />
          <circle cx="28" cy="36" r="4" fill={P.coral} />
          <circle cx="94" cy="30" r="4" fill={P.mint} />
          <circle cx="92" cy="86" r="4" fill={P.sky} />
          <circle cx="26" cy="84" r="4" fill={P.violet} />
        </>
      )}
      {scene === "rescue" && (
        <>
          <circle cx="60" cy="60" r="30" fill="none" stroke={P.coral} strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r="30"
            fill="none"
            stroke={P.sun}
            strokeWidth="10"
            strokeDasharray="23 24"
          />
          <circle cx="60" cy="60" r="10" fill={P.mint} />
        </>
      )}
    </svg>
  );
}

/** Illustration + message + optional action, used for every empty and "all clear" state. */
export function EmptyState({
  scene,
  title,
  children,
}: {
  scene: Scene;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state" style={{ textAlign: "center", padding: "1.2rem 0" }}>
      <Illustration scene={scene} />
      <h3 style={{ margin: ".4rem 0" }}>{title}</h3>
      <div className="muted">{children}</div>
    </div>
  );
}
