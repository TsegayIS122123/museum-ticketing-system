/**
 * Decorative backgrounds for the visitor surface (UI polish round).
 *
 * Everything here is `aria-hidden`, ignores the pointer, and is plain
 * SVG/CSS (no images to download, nothing to lazy-load). Motion lives in
 * globals.css, only animates transform/opacity, and is switched off for
 * `prefers-reduced-motion`, staff pages and print.
 */

// Deterministic specks so server and client render identically (no
// Math.random, which would cause a hydration mismatch).
const SPECKS = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 37 + 7) % 100}%`,
  size: 3 + ((i * 5) % 6),
  duration: 14 + ((i * 7) % 16),
  delay: -((i * 3) % 18),
}));

function Paw({ className, style, color }: { className: string; style: React.CSSProperties; color: string }) {
  return (
    <svg className={`absolute hidden lg:block ${className}`} style={style} width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" fill={color}>
      <ellipse cx="32" cy="42" rx="14" ry="11" />
      <ellipse cx="14" cy="26" rx="6" ry="8" transform="rotate(-20 14 26)" />
      <ellipse cx="25" cy="16" rx="6" ry="8.5" transform="rotate(-6 25 16)" />
      <ellipse cx="39" cy="16" rx="6" ry="8.5" transform="rotate(6 39 16)" />
      <ellipse cx="50" cy="26" rx="6" ry="8" transform="rotate(20 50 26)" />
    </svg>
  );
}

function Ring({ className, style, color }: { className: string; style: React.CSSProperties; color: string }) {
  return (
    <svg className={`absolute hidden md:block ${className}`} style={style} width="120" height="120" viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke={color} strokeWidth="5">
      <circle cx="60" cy="60" r="46" />
      <circle cx="60" cy="60" r="26" strokeDasharray="4 10" strokeLinecap="round" />
    </svg>
  );
}

function Leaf({ className, style, color }: { className: string; style: React.CSSProperties; color: string }) {
  return (
    <svg className={`absolute hidden md:block ${className}`} style={style} width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <path d="M8 48 C6 24 22 8 48 8 C50 34 34 50 8 48 Z" fill={color} />
      <path d="M10 46 C22 34 32 24 44 12" stroke="#fff" strokeWidth="2" fill="none" opacity="0.7" />
    </svg>
  );
}

/** Full-page bright wash + drifting colour blobs + rising specks. */
export function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-blob b1" />
      <div className="ambient-blob b2" />
      <div className="ambient-blob b3" />
      <div className="ambient-blob b4" />
      {/* Margin motifs: paw prints, rings and leaves float in the side
          gutters, where wide screens would otherwise be empty. Hidden on
          small screens so nothing competes with content. */}
      <Paw className="float-y slow" style={{ left: '5%', top: '58%', opacity: 0.28, rotate: '-18deg' }} color="#0fb27f" />
      <Paw className="float-y late" style={{ left: '11%', top: '72%', opacity: 0.2, rotate: '10deg' }} color="#0fb27f" />
      <Paw className="float-y slow late" style={{ right: '6%', top: '30%', opacity: 0.26, rotate: '16deg' }} color="#e07a00" />
      <Paw className="float-y" style={{ right: '12%', top: '46%', opacity: 0.18, rotate: '-8deg' }} color="#e07a00" />
      <Ring className="float-y slow" style={{ left: '8%', top: '22%', opacity: 0.5 }} color="#29c3f5" />
      <Ring className="float-y late" style={{ right: '9%', top: '70%', opacity: 0.45 }} color="#ff6b6b" />
      <Leaf className="float-y" style={{ left: '17%', top: '40%', opacity: 0.55, rotate: '-25deg' }} color="#2fd29a" />
      <Leaf className="float-y slow late" style={{ right: '19%', top: '18%', opacity: 0.5, rotate: '30deg' }} color="#ffbe0b" />
      {SPECKS.map((s, i) => (
        <span
          key={i}
          className="ambient-speck"
          style={{ left: s.left, width: s.size, height: s.size, animationDuration: `${s.duration}s`, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

function Acacia({ x, y, scale = 1, tone = '#0a7a52' }: { x: number; y: number; scale?: number; tone?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-4 0 C-3 -26 -2 -44 -9 -62 L-5 -63 C0 -48 2 -34 4 -20 C7 -34 12 -46 22 -56 L25 -52 C14 -42 8 -28 5 0 Z" fill="#5b3a29" />
      <ellipse cx="-4" cy="-72" rx="48" ry="12" fill={tone} />
      <ellipse cx="22" cy="-62" rx="30" ry="8" fill={tone} opacity="0.92" />
      <ellipse cx="-30" cy="-64" rx="26" ry="7" fill={tone} opacity="0.9" />
    </g>
  );
}

/** A grazing Walia ibex silhouette (long swept-back horns). */
function Ibex({ x, y, scale = 1, flip = false }: { x: number; y: number; scale?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`} fill="#0b5a3f">
      <ellipse cx="0" cy="-26" rx="22" ry="10" />
      <rect x="-17" y="-20" width="3.4" height="20" rx="1.5" />
      <rect x="-9" y="-20" width="3.4" height="20" rx="1.5" />
      <rect x="8" y="-20" width="3.4" height="20" rx="1.5" />
      <rect x="15" y="-20" width="3.4" height="20" rx="1.5" />
      <g className="graze">
        <path d="M16 -32 C24 -40 28 -46 30 -50 L35 -48 C33 -42 30 -34 24 -26 Z" />
        <ellipse cx="34" cy="-50" rx="6.5" ry="4.2" transform="rotate(-18 34 -50)" />
        <path d="M32 -54 C28 -66 14 -72 4 -64" fill="none" stroke="#0b5a3f" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 -54 C32 -68 20 -78 8 -74" fill="none" stroke="#0b5a3f" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </g>
  );
}

function GrassRow({ from, to, y, step = 26 }: { from: number; to: number; y: number; step?: number }) {
  const blades = [];
  for (let x = from; x < to; x += step) {
    const h = 16 + ((x * 7) % 14);
    blades.push(
      <path key={x} className="grass" d={`M${x} ${y} C${x - 3} ${y - h * 0.5} ${x + 1} ${y - h * 0.8} ${x + 4} ${y - h} C${x + 5} ${y - h * 0.6} ${x + 6} ${y - h * 0.3} ${x + 7} ${y} Z`} fill="#0a8f63" />
    );
  }
  return <g>{blades}</g>;
}

function Cloud({ className, top, scale = 1 }: { className: string; top: string; scale?: number }) {
  return (
    <svg className={`cloud ${className} absolute left-0`} style={{ top }} width={120 * scale} height={52 * scale} viewBox="0 0 120 52" aria-hidden="true">
      <g fill="#fff" opacity="0.9">
        <ellipse cx="38" cy="34" rx="30" ry="14" />
        <ellipse cx="66" cy="26" rx="26" ry="16" />
        <ellipse cx="88" cy="36" rx="26" ry="12" />
      </g>
    </svg>
  );
}

function Bird({ className, top }: { className: string; top: string }) {
  return (
    <svg className={`bird ${className} absolute left-0`} style={{ top }} width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
      <g className="bird-wing" fill="none" stroke="#02324d" strokeWidth="2.4" strokeLinecap="round">
        <path d="M2 12 Q9 0 17 10 Q25 0 32 12" />
      </g>
    </svg>
  );
}

/**
 * The landing hero's backdrop: a sunny savanna sky (pulsing sun, drifting
 * clouds, birds) over layered hills with acacias, grazing walia ibex and
 * swaying grass. Sits absolutely behind the hero copy.
 */
export function SavannaScene() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-300/70 via-sky-300/25 to-transparent" />
      {/* sun */}
      <svg className="absolute -top-4 right-[1%] h-40 w-40 sm:h-56 sm:w-56" viewBox="0 0 200 200">
        <defs>
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="55%" stopColor="#ffbe0b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffbe0b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill="url(#sunGlow)" />
        <g className="sun-rays" stroke="#ffd166" strokeWidth="5" strokeLinecap="round">
          {Array.from({ length: 16 }, (_, i) => (
            <line key={i} x1="100" y1="22" x2="100" y2="38" transform={`rotate(${i * 22.5} 100 100)`} />
          ))}
        </g>
        <circle className="sun-core" cx="100" cy="100" r="40" fill="#ffbe0b" />
        <circle cx="100" cy="100" r="30" fill="#ffd54d" />
      </svg>
      <Cloud className="c1" top="12%" />
      <Cloud className="c2" top="26%" scale={0.75} />
      <Cloud className="c3" top="6%" scale={1.2} />
      <Bird className="k1" top="22%" />
      <Bird className="k2" top="34%" />
      <Bird className="k3" top="16%" />
      {/* hills */}
      <svg className="absolute inset-x-0 bottom-0 h-[46%] w-full min-h-[200px]" viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8ee3bd" />
            <stop offset="100%" stopColor="#5fd0a2" />
          </linearGradient>
          <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3fcb94" />
            <stop offset="100%" stopColor="#1fae7c" />
          </linearGradient>
          <linearGradient id="hillNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12a374" />
            <stop offset="100%" stopColor="#078a62" />
          </linearGradient>
        </defs>
        <g className="hill-far">
          <path d="M-40 230 C160 150 320 150 520 214 C700 270 860 160 1060 170 C1240 180 1340 230 1500 190 L1500 360 L-40 360 Z" fill="url(#hillFar)" />
          <Ibex x={930} y={186} scale={0.8} />
          <Ibex x={1010} y={188} scale={0.62} flip />
        </g>
        <g className="hill-near">
          <path d="M-40 290 C140 220 330 232 520 276 C720 322 900 232 1120 252 C1290 268 1390 300 1500 270 L1500 360 L-40 360 Z" fill="url(#hillMid)" />
          <Acacia x={180} y={268} scale={0.95} />
          <Acacia x={1240} y={262} scale={1.1} tone="#087a55" />
          <Ibex x={420} y={282} scale={0.9} flip />
        </g>
        <path d="M-40 330 C200 290 420 318 700 322 C980 326 1200 296 1500 326 L1500 360 L-40 360 Z" fill="url(#hillNear)" />
        <GrassRow from={0} to={1440} y={346} />
      </svg>
    </div>
  );
}

/** Low strip of hills + grass + acacia that sits above the footer on every
 *  visitor page, so short pages never end in dead space. */
export function GroundScene() {
  return (
    <div className="ground-scene pointer-events-none relative mt-10 h-24 w-full overflow-hidden sm:h-32" aria-hidden="true">
      <svg className="absolute inset-x-0 bottom-0 h-full w-full" viewBox="0 0 1440 140" preserveAspectRatio="xMidYMax slice">
        <g className="hill-far">
          <path d="M-40 90 C180 40 380 52 600 84 C820 116 1020 50 1240 62 C1360 70 1440 90 1500 80 L1500 140 L-40 140 Z" fill="#7fdcb6" opacity="0.8" />
        </g>
        <g className="hill-near">
          <path d="M-40 112 C160 78 360 92 560 110 C780 128 980 84 1180 96 C1320 104 1420 116 1500 106 L1500 140 L-40 140 Z" fill="#2fd29a" />
          <Acacia x={1130} y={104} scale={0.55} tone="#0a8f63" />
          <Acacia x={250} y={110} scale={0.42} tone="#0a8f63" />
          <Ibex x={640} y={116} scale={0.5} />
        </g>
        <path d="M-40 130 C300 116 700 134 1000 126 C1200 120 1380 130 1500 128 L1500 140 L-40 140 Z" fill="#0fb27f" />
        <GrassRow from={0} to={1440} y={138} step={30} />
      </svg>
    </div>
  );
}

/** Wavy section divider; `className` sets the fill via `text-*`. */
export function WaveDivider({ className = 'text-white', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      className={`block w-full ${className}`}
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      height="48"
      aria-hidden="true"
    >
      <path fill="currentColor" d="M0 30 C240 70 480 -10 720 28 C960 66 1200 -6 1440 30 L1440 60 L0 60 Z" />
    </svg>
  );
}

const CONFETTI_COLORS = ['#ffbe0b', '#29c3f5', '#2fd29a', '#ff6b6b', '#9b6bff', '#015484'];

/** One-shot confetti burst for the booking confirmation. Deterministic
 *  (no Math.random) so server and client markup match. */
export function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0" aria-hidden="true">
      {Array.from({ length: 44 }, (_, i) => {
        const w = 7 + ((i * 5) % 7);
        const round = i % 3 === 0;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: `${(i * 23 + 5) % 100}%`,
                width: w,
                height: round ? w : w * 1.7,
                borderRadius: round ? 9999 : 2,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 11) * 0.12}s`,
                animationDuration: `${2.8 + (i % 6) * 0.35}s`,
                '--drift': `${((i % 7) - 3) * 28}px`,
                '--spin': `${360 + (i % 5) * 140}deg`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
