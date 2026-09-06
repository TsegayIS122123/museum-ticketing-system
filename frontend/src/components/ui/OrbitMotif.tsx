/**
 * Illustrated stand-in for exhibit photography (see locked constraints in
 * the redesign brief: no real photos exist yet, and a placeholder-photo
 * box would look unfinished rather than deliberate). This is a simple
 * line-art "orbit" motif -- a nod to a science museum without depicting
 * any specific exhibit -- built entirely from the existing brand-blue
 * scale plus stone neutrals, so swapping it for real photography later
 * is a drop-in replacement, not a redesign.
 *
 * `size` controls the two places it's used: the landing-page hero (large)
 * and the booking-flow header (compact, less visual weight since that
 * screen is about the task, not the pitch).
 */
export function OrbitMotif({
  className,
  size = 'large',
}: {
  className?: string;
  size?: 'large' | 'compact';
}) {
  const strokeWidth = size === 'large' ? 1.5 : 2;

  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      role="img"
      aria-label=""
      aria-hidden="true"
    >
      {/* Orbit rings */}
      <circle cx="200" cy="200" r="150" fill="none" stroke="var(--color-primary-100)" strokeWidth={strokeWidth} />
      <ellipse cx="200" cy="200" rx="150" ry="60" fill="none" stroke="var(--color-primary-200)" strokeWidth={strokeWidth} transform="rotate(-20 200 200)" />
      <ellipse cx="200" cy="200" rx="150" ry="60" fill="none" stroke="var(--color-primary-300)" strokeWidth={strokeWidth} transform="rotate(45 200 200)" />

      {/* Nucleus */}
      <circle cx="200" cy="200" r="22" fill="var(--color-brand-primary)" />
      <circle cx="200" cy="200" r="22" fill="none" stroke="var(--color-primary-100)" strokeWidth="3" />

      {/* Orbiting bodies, sitting on the rings above */}
      <circle cx="350" cy="200" r="8" fill="var(--color-primary-600)" />
      <circle cx="126" cy="128" r="6" fill="var(--color-primary-400)" />
      <circle cx="257" cy="331" r="6" fill="var(--color-primary-500)" />
      <circle cx="80" cy="240" r="5" fill="var(--color-stone-400)" />

      {/* A few loose dots for texture, echoing a starfield/data-point feel */}
      <circle cx="60" cy="80" r="3" fill="var(--color-stone-300)" />
      <circle cx="340" cy="80" r="3" fill="var(--color-stone-300)" />
      <circle cx="320" cy="330" r="3" fill="var(--color-stone-300)" />
      <circle cx="40" cy="320" r="3" fill="var(--color-stone-300)" />
    </svg>
  );
}
