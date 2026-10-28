/* The brand mark: the one place the pink-to-purple gradient is a fill. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="dm-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff1aa1" />
          <stop offset="0.5" stopColor="#d61eb2" />
          <stop offset="1" stopColor="#8b29e0" />
        </linearGradient>
      </defs>
      <path
        d="M12 3c1.2 1.6 2.5 2.4 4 2.4S18.8 4.6 20 3l2 1.2-1.6 6.3c-.2.8 0 1.6.5 2.3L28 28H4l7.1-15.2c.5-.7.7-1.5.5-2.3L10 4.2 12 3z"
        fill="url(#dm-logo)"
      />
    </svg>
  );
}

export function Logo({ showWord = true }: { showWord?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <LogoMark />
      {showWord && (
        <span className="brand-word">
          dressmaker<span className="brand-ai">.ai</span>
        </span>
      )}
    </span>
  );
}
