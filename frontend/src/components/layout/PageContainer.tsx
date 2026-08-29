import { cn } from '@/lib/utils/cn';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const maxWidths = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  full: 'max-w-full',
};

export function PageContainer({
  children,
  className,
  maxWidth = 'xl',
}: PageContainerProps) {
  return (
    <div className={cn('mx-auto px-4 sm:px-6 lg:px-8 py-6', maxWidths[maxWidth], className)}>
      {children}
    </div>
  );
}
