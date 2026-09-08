import { cn } from '@/lib/utils/cn';

export function Card({
  children,
  className,
  padding = true,
  onClick,
  role,
  tabIndex,
  onKeyDown,
  'aria-pressed': ariaPressed,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  'aria-pressed'?: boolean;
}) {
  return (
    <div
      data-slot="card"
      data-padding={padding}
      className={cn(
        'bg-white rounded-xl border border-stone-200 shadow-sm',
        padding && 'p-4 sm:p-6',
        className
      )}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      aria-pressed={ariaPressed}
    >
      {children}
    </div>
  );
}
