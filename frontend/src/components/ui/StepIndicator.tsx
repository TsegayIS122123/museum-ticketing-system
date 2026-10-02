'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface StepIndicatorProps {
  steps: string[];
  current: number;
  className?: string;
}

export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  return (
    <div className={cn("flex items-center w-full", className)}>
      {steps.map((step, index) => (
        <div key={index} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center min-w-0">
            <div
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all flex-shrink-0",
                index < current
                  ? "bg-brand-primary border-brand-primary text-white"
                  : index === current
                  ? "bg-white border-brand-primary text-brand-primary ring-4 ring-primary-100"
                  : "bg-white border-stone-300 text-stone-500"
              )}
            >
              {index < current ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            <div
              className={cn(
                "text-xs mt-1.5 font-medium text-center whitespace-nowrap",
                index <= current ? "text-brand-primary" : "text-stone-500"
              )}
            >
              {step}
            </div>
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                "flex-1 h-0.5 mx-1 mb-5 transition-colors",
                index < current ? "bg-brand-primary" : "bg-stone-300"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
