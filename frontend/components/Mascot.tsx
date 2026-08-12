type MascotProps = {
  size?: number;
  className?: string;
};

/**
 * "Glimmer" — an original chibi crystal-fox spirit mascot, drawn from scratch for this app
 * (no third-party character art). Floats, blinks, and sways its tail via CSS animations
 * defined in globals.css (.mascot-float / .mascot-blink / .mascot-tail / .mascot-sparkle).
 */
export default function Mascot({ size = 120, className = "" }: MascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`mascot-float ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="glimmer-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9b8ff" />
          <stop offset="100%" stopColor="#8b6dff" />
        </linearGradient>
        <linearGradient id="glimmer-belly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#f1ecff" />
        </linearGradient>
        <radialGradient id="glimmer-gem" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="45%" stopColor="#ffcf40" />
          <stop offset="100%" stopColor="#ff9d3d" />
        </radialGradient>
      </defs>

      {/* sparkle trail */}
      <g className="mascot-sparkle" style={{ animationDelay: "0.2s" }}>
        <path d="M28 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#33c7ff" />
      </g>
      <g className="mascot-sparkle" style={{ animationDelay: "1s" }}>
        <path d="M170 60 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#ff5cad" />
      </g>
      <g className="mascot-sparkle" style={{ animationDelay: "1.8s" }}>
        <circle cx="150" cy="150" r="3.5" fill="#ffcf40" />
      </g>

      {/* tail */}
      <g className="mascot-tail">
        <path
          d="M140 130 C 175 125, 182 95, 160 78 C 178 92, 172 122, 138 138 Z"
          fill="url(#glimmer-body)"
          stroke="#6d4fd6"
          strokeWidth="2"
        />
        <path d="M160 78 C170 88, 172 104, 162 118" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      </g>

      {/* ears */}
      <path d="M62 55 L48 15 L82 48 Z" fill="url(#glimmer-body)" stroke="#6d4fd6" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M138 55 L152 15 L118 48 Z" fill="url(#glimmer-body)" stroke="#6d4fd6" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M65 45 L57 25 L74 42 Z" fill="#ffe1f2" />
      <path d="M135 45 L143 25 L126 42 Z" fill="#ffe1f2" />

      {/* headphones (music tie-in) */}
      <path d="M52 95 C52 55, 148 55, 148 95" stroke="#241b4d" strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="40" y="90" width="18" height="26" rx="9" fill="#ff5cad" stroke="#6d4fd6" strokeWidth="2" />
      <rect x="142" y="90" width="18" height="26" rx="9" fill="#33c7ff" stroke="#6d4fd6" strokeWidth="2" />

      {/* head */}
      <circle cx="100" cy="105" r="58" fill="url(#glimmer-body)" stroke="#6d4fd6" strokeWidth="2.5" />
      {/* belly/muzzle patch */}
      <ellipse cx="100" cy="128" rx="34" ry="26" fill="url(#glimmer-belly)" />

      {/* forehead gem */}
      <path d="M100 62 l10 14 -10 14 -10 -14z" fill="url(#glimmer-gem)" stroke="#ff9d3d" strokeWidth="1.5" />

      {/* cheeks */}
      <ellipse cx="66" cy="120" rx="9" ry="6" fill="#ff8fc7" opacity="0.6" />
      <ellipse cx="134" cy="120" rx="9" ry="6" fill="#ff8fc7" opacity="0.6" />

      {/* eyes */}
      <g className="mascot-blink">
        <ellipse cx="80" cy="105" rx="9" ry="12" fill="#241b4d" />
        <circle cx="83" cy="100" r="3" fill="#fff" />
        <ellipse cx="120" cy="105" rx="9" ry="12" fill="#241b4d" />
        <circle cx="123" cy="100" r="3" fill="#fff" />
      </g>

      {/* nose + smile */}
      <ellipse cx="100" cy="128" rx="4" ry="3" fill="#6d4fd6" />
      <path d="M92 134 Q100 140 108 134" stroke="#6d4fd6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
