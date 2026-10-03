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
                  ? "bg-gradient-to-br from-leaf-400 to-leaf-600 border-leaf-500 text-white shadow-md"
                  : index === current
                  ? "bg-gradient-to-br from-primary-500 to-sky-400 border-white text-white ring-4 ring-sky-300/60 shadow-lg scale-110"
                  : "bg-white border-stone-300 text-stone-500"
              )}
            >
              {index < current ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            <div
              className={cn(
                "text-xs mt-1.5 font-medium text-center whitespace-nowrap",
                index <= current ? "text-primary-700 font-semibold" : "text-stone-600"
              )}
            >
              {step}
            </div>
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                "flex-1 h-1 rounded-full mx-1 mb-5 transition-colors",
                index < current ? "bg-gradient-to-r from-leaf-400 to-leaf-500" : "bg-stone-300/80"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
