import { cn } from '@/lib/utils/cn';
import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'slate' | 'primary' | 'secondary' | 'green' | 'red' | 'blue';
  className?: string;
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
}: StatCardProps) {
  return (
    <Card className={cn('text-center', className)}>
      <div className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={cn('text-2xl font-serif font-semibold', colors[color])}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-stone-400 mt-0.5">{sub}</div>
      )}
    </Card>
  );
}
