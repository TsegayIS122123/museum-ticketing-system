import { cn } from '@/lib/utils/cn';
import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function TextField({ label, error, className, id, ...props }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-stone-700">
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white',
          'focus:outline-none focus:ring-2 focus:ring-slate-700 focus:border-transparent transition-all',
          error && 'border-red-400',
          className
        )}
        {...props}
      />
      {error && (
        <span id={`${id}-error`} className="text-xs text-red-500">
          {error}
        </span>
      )}
    </div>
  );
}
