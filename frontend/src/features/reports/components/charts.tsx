'use client';

/**
 * Hand-rolled SVG charts for the Manager reports (no chart dependency --
 * see Phase 7c). Every chart takes plain numbers, renders an accessible
 * <svg role="img"> with a text summary, and never invents data: an empty
 * series renders nothing, so callers show their own "No visits in this
 * range" state instead.
 */
import { useId } from 'react';

// Colour-blind-safe-ish palette built on the existing brand blue; the
// same index always maps to the same colour so legends stay consistent.
export const CHART_COLORS = ['#015484', '#0f9d7a', '#d98e04', '#8b5cf6', '#dc2626', '#0ea5e9', '#64748b'];

export function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export interface Bar {
  label: string;
  value: number;
  title?: string;
}

/** Simple vertical bar chart (one series). Used for revenue per bucket. */
export function BarChart({
  bars,
  ariaLabel,
  formatValue,
  color = CHART_COLORS[0],
}: {
  bars: Bar[];
  ariaLabel: string;
  formatValue: (n: number) => string;
  color?: string;
}) {
  const W = 640;
  const H = 220;
  const pad = { top: 16, right: 8, bottom: 34, left: 8 };
  const max = Math.max(1, ...bars.map((b) => b.value));
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / Math.max(1, bars.length);
  const barW = Math.min(48, slot * 0.7);
  // Thin the x labels so they never overlap on long ranges.
  const every = Math.ceil(bars.length / 10);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="w-full h-auto">
      <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="#d6d0c8" />
      {bars.map((b, i) => {
        const h = (b.value / max) * innerH;
        const x = pad.left + slot * i + (slot - barW) / 2;
        const y = H - pad.bottom - h;
        return (
          <g key={`${b.label}-${i}`}>
            <rect x={x} y={y} width={barW} height={Math.max(h, b.value > 0 ? 1 : 0)} rx={3} fill={color}>
              <title>{b.title ?? `${b.label}: ${formatValue(b.value)}`}</title>
            </rect>
            {bars.length <= 12 && b.value > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#5e5446">
                {formatValue(b.value)}
              </text>
            )}
            {i % every === 0 && (
              <text x={x + barW / 2} y={H - 14} textAnchor="middle" fontSize="10" fill="#7c7264">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export interface StackedBucket {
  label: string;
  parts: { key: string; value: number }[];
}

/** Stacked vertical bars: one bar per period, one segment per category. */
export function StackedBarChart({
  buckets,
  keys,
  ariaLabel,
}: {
  buckets: StackedBucket[];
  keys: string[];
  ariaLabel: string;
}) {
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 34, left: 8 };
  const totals = buckets.map((b) => b.parts.reduce((s, p) => s + p.value, 0));
  const max = Math.max(1, ...totals);
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / Math.max(1, buckets.length);
  const barW = Math.min(48, slot * 0.7);
  const every = Math.ceil(buckets.length / 10);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="w-full h-auto">
      <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="#d6d0c8" />
      {buckets.map((b, i) => {
        const x = pad.left + slot * i + (slot - barW) / 2;
        let yCursor = H - pad.bottom;
        return (
          <g key={`${b.label}-${i}`}>
            {keys.map((key, ki) => {
              const value = b.parts.find((p) => p.key === key)?.value ?? 0;
              if (!value) return null;
              const h = (value / max) * innerH;
              yCursor -= h;
              return (
                <rect key={key} x={x} y={yCursor} width={barW} height={h} fill={colorAt(ki)}>
                  <title>{`${b.label} - ${key}: ${value}`}</title>
                </rect>
              );
            })}
            {i % every === 0 && (
              <text x={x + barW / 2} y={H - 14} textAnchor="middle" fontSize="10" fill="#7c7264">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Donut with a centre total. Segments with value 0 are skipped. */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  ariaLabel,
}: {
  slices: { key: string; value: number }[];
  centerLabel: string;
  centerValue: string;
  ariaLabel: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={ariaLabel} className="w-48 h-48 flex-shrink-0">
      <circle cx="100" cy="100" r={R} fill="none" stroke="#f5f3ef" strokeWidth="26" />
      {total > 0 &&
        slices.map((s, i) => {
          if (!s.value) return null;
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={s.key}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={colorAt(i)}
              strokeWidth="26"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            >
              <title>{`${s.key}: ${s.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      <text x="100" y="96" textAnchor="middle" fontSize="11" fill="#7c7264">
        {centerLabel}
      </text>
      <text x="100" y="116" textAnchor="middle" fontSize="16" fontWeight="600" fill="#1c1917">
        {centerValue}
      </text>
    </svg>
  );
}

/** Horizontal paired bars (booked vs attended) per row, for Attendance. */
export function PairedBars({
  rows,
  leftLabel,
  rightLabel,
}: {
  rows: { label: string; left: number; right: number }[];
  leftLabel: string;
  rightLabel: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.left, r.right]));
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="text-sm font-medium text-stone-800 mb-1">{r.label}</div>
          {[
            { label: leftLabel, v: r.left, c: '#b8b0a4' },
            { label: rightLabel, v: r.right, c: CHART_COLORS[0] },
          ].map((bar) => (
            <div key={bar.label} className="flex items-center gap-2 text-xs text-stone-600 mb-1">
              <span className="w-20 flex-shrink-0">{bar.label}</span>
              <div className="flex-1 h-3 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(bar.v / max) * 100}%`, background: bar.c }} />
              </div>
              <span className="w-12 text-right tabular-nums">{bar.v}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: string[] }) {
  const id = useId();
  return (
    <ul id={id} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
      {items.map((name, i) => (
        <li key={name} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorAt(i) }} aria-hidden />
          {name}
        </li>
      ))}
    </ul>
  );
}
