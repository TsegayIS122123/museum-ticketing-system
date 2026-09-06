'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { InputHTMLAttributes } from 'react';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

export function PasswordField({ label, error, className, id, ...props }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={id} className="text-sm font-medium text-stone-700">{label}</label>}
      <div className="relative">
        <input
          {...props}
          id={id}
          type={isVisible ? 'text' : 'password'}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 pr-11 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:border-transparent transition-all',
            error && 'border-red-400',
            className
          )}
        />
        <button
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-stone-500 hover:text-brand-primary"
        >
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <span id={`${id}-error`} className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
