import { cn } from '@/lib/utils/cn';
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

// forwardRef -- ReferenceLookupField (entrance/gate) attaches a ref here
// to auto-focus the reference input on mount for a Cashier scanning
// booking after booking. A plain function component can't accept `ref`
// (it's not a prop), so without forwardRef that ref silently does
// nothing and TypeScript flags the `ref={inputRef}` call site as a type
// error.
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, className, id, ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-stone-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
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
});
