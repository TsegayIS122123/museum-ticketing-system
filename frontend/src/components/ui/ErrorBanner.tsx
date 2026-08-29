'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface ErrorBannerProps {
  message: string;
  dismissible?: boolean;
  className?: string;
}

export function ErrorBanner({
  message,
  dismissible = true,
  className,
}: ErrorBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || !message) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800',
        className
      )}
      role="alert"
    >
      <span className="flex-shrink-0 text-lg">⚠️</span>
      <span className="flex-1">{message}</span>
      {dismissible && (
        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 text-red-600 hover:text-red-800 transition-colors"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  );
}
