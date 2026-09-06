import { cn } from '@/lib/utils/cn';

export function Card({
  children,
  className,
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-stone-200 shadow-sm',
        padding && 'p-4 sm:p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
