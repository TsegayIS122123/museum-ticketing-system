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
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all flex-shrink-0",
                index < current
                  ? "bg-slate-800 border-slate-800 text-white"
                  : index === current
                  ? "bg-white border-slate-800 text-slate-800"
                  : "bg-white border-stone-300 text-stone-400"
              )}
            >
              {index < current ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            <div
              className={cn(
                "text-xs mt-1 font-medium text-center whitespace-nowrap",
                index <= current ? "text-slate-800" : "text-stone-400"
              )}
            >
              {step}
            </div>
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                "flex-1 h-0.5 mx-1 mb-4",
                index < current ? "bg-slate-800" : "bg-stone-300"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
