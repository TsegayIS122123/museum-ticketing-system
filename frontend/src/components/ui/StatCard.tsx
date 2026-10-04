import { cn } from '@/lib/utils/cn';
import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'slate' | 'primary' | 'secondary' | 'green' | 'red' | 'blue';
  className?: string;
  // Optional -- omitted everywhere except the filterable stat rows (e.g.
  // My Bookings) that need a card to double as a filter toggle. Every
  // other existing call site (staff admin/refunds/reports/dashboard)
  // passes neither, so it keeps rendering as a plain, non-interactive
  // card exactly as before.
  onClick?: () => void;
  selected?: boolean;
  // Opt-in colour accent (visitor surface only): a coloured top edge and
  // icon chip. Omitted by every staff call site, which stay flat.
  accent?: 'sky' | 'sun' | 'leaf' | 'coral';
  icon?: React.ReactNode;
}

const colors: Record<NonNullable<StatCardProps['color']>, string> = {
  slate: 'text-stone-800',
  primary: 'text-primary-600',
  secondary: 'text-secondary-600',
  green: 'text-emerald-700',
  red: 'text-red-600',
  blue: 'text-blue-600',
};

const accents = {
  sky: { bar: 'border-t-sky-400', chip: 'from-sky-400 to-primary-500' },
  sun: { bar: 'border-t-sun-400', chip: 'from-sun-400 to-sun-600' },
  leaf: { bar: 'border-t-leaf-400', chip: 'from-leaf-400 to-leaf-600' },
  coral: { bar: 'border-t-coral-400', chip: 'from-coral-400 to-coral-500' },
} as const;

export function StatCard({
  label,
  value,
  sub,
  color = 'slate',
  className,
  onClick,
  selected = false,
  accent,
  icon,
}: StatCardProps) {
  const interactive = !!onClick;

  return (
    <Card
      className={cn(
        'text-center',
        accent && ['border-t-4 lift', accents[accent].bar],
        interactive && 'cursor-pointer transition-shadow hover:shadow-md',
        interactive && selected && 'ring-2 ring-primary-500',
        className
      )}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {accent && icon && (
        <span className={cn('mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow', accents[accent].chip)} aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="text-[11px] sm:text-xs text-stone-600 font-medium uppercase tracking-wide sm:tracking-wider mb-1 break-words">
        {label}
      </div>
      <div
        data-slot="stat-value"
        className={cn('text-2xl font-serif font-semibold tabular-nums', colors[color])}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-stone-500 mt-0.5">{sub}</div>
      )}
    </Card>
  );
}
