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
}

const colors: Record<NonNullable<StatCardProps['color']>, string> = {
  slate: 'text-stone-800',
  primary: 'text-primary-600',
  secondary: 'text-secondary-600',
  green: 'text-emerald-700',
  red: 'text-red-600',
  blue: 'text-blue-600',
};

export function StatCard({
  label,
  value,
  sub,
  color = 'slate',
  className,
  onClick,
  selected = false,
}: StatCardProps) {
  const interactive = !!onClick;

  return (
    <Card
      className={cn(
        'text-center',
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
      <div className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        data-slot="stat-value"
        className={cn('text-2xl font-serif font-semibold tabular-nums', colors[color])}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-stone-400 mt-0.5">{sub}</div>
      )}
    </Card>
  );
}
